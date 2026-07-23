class Car {
  static #sharedImage = null; //Single image for all cars

  static stagnationFramesLimit = 300;
  static stagnationEpsilon = 2; //Pixels of forward progress to reset stagnation timer

  static #getSharedImage() {
    if (!Car.#sharedImage) {
      Car.#sharedImage = new Image();
      Car.#sharedImage.src = "car.png";
    }
    return Car.#sharedImage;
  }

  constructor(x, y, width, height, controlType, maxSpeed = 3, color = "blue") {
    this.x = x; //Car's x position
    this.y = y; //Car's y position
    this.width = width; //Car's width
    this.height = height; //Car's height

    this.speed = 0; //Current speed
    this.acceleration = 0.2; //Acceleration rate
    this.maxSpeed = maxSpeed; //Maximum speed
    this.friction = 0.05; //Friction coefficient
    this.angle = 0; //Current angle (radians)
    this.damaged = false; //Is car damaged/crashed

    this.useBrain = controlType === "AI"; //Use neural network for AI cars

    this.bestY = y; //Best y position for stagnation check
    this.stagnantFrames = 0; //Frames without progress

    //#Initialize sensor and brain for non-dummy cars
    if (controlType !== "DUMMY") {
      this.sensor = new Sensor(this);
      const inputCount = this.sensor.rayCount * 2; //2 inputs per ray (closeness + closing rate)
      const hiddenSize = Math.max(10, Math.round(inputCount * 0.6)); //Hidden layer size
      this.brain = new NeuralNetwork([inputCount, hiddenSize, 4]); //4 outputs: forward, left, right, reverse
    }
    this.controls = new Controls(controlType); //Control inputs

    this.img = Car.#getSharedImage(); //Shared car sprite
    this.mask = document.createElement("canvas"); //Canvas for color mask
    this.mask.width = width;
    this.mask.height = height;
    this.#buildMask(color); //Create colored mask

    //#Turn commitment state (anti-flicker)
    this.committedTurn = null; //Current committed turn direction
    this.pendingTurn = null; //Pending turn direction
    this.pendingTurnFrames = 0; //Frames pending turn has been requested

    this.hardBrakeFrames = 0; //Frames in emergency brake state
  }

  //Build colored mask for car
  #buildMask(color) {
    const paint = () => {
      const maskCtx = this.mask.getContext("2d");
      maskCtx.fillStyle = color;
      maskCtx.rect(0, 0, this.width, this.height);
      maskCtx.fill();

      //Apply mask to car image
      maskCtx.globalCompositeOperation = "destination-atop";
      maskCtx.drawImage(this.img, 0, 0, this.width, this.height);
    };

    if (this.img.complete && this.img.naturalWidth > 0) {
      paint();
    } else {
      this.img.addEventListener("load", paint, { once: true });
    }
  }

  //Update car state each frame
  update(roadBorders, traffic) {
    if (this.sensor) {
      this.sensor.update(roadBorders, traffic);

      if (this.useBrain) {
        //Prepare sensor inputs for neural network
        const closeness = this.sensor.readings.map(
          (s) => (s == null ? 0 : 1 - s.offset), //Convert to 0-1 range
        );
        const inputs = [...closeness, ...this.sensor.closingRates]; //Combine inputs
        const outputs = NeuralNetwork.feedForward(inputs, this.brain); //Get network outputs
        this.#decideControls(outputs); //Convert outputs to controls
        this.#applyEmergencyFailsafe(); //Apply safety checks
      } else {
        //Non-AI cars still need to update sensor for visualization
        NeuralNetwork.feedForward(
          this.sensor.readings
            .map((s) => (s == null ? 0 : 1 - s.offset))
            .concat(this.sensor.closingRates),
          this.brain,
        );
      }
    }
    if (!this.damaged) {
      this.#move(); //Update position
      this.polygon = this.#createPolygon(); //Update collision polygon
      this.damaged = this.#assessDamage(roadBorders, traffic); //Check for collisions
      this.#updateStagnation(); //Check for stagnation
    }
  }

  //Convert network outputs to control decisions
  #decideControls(outputs) {
    const TURN_COMMIT_FRAMES = 2; //Frames to confirm turn direction

    this.controls.forward = !!outputs[0]; //Forward control
    this.controls.reverse = !!outputs[3]; //Reverse control

    //Determine turn direction
    const rawLeft = !!outputs[1];
    const rawRight = !!outputs[2];
    const desiredTurn =
      rawLeft && !rawRight ? "left" : rawRight && !rawLeft ? "right" : null;

    //Handle turn commitment logic
    if (desiredTurn === this.committedTurn) {
      this.pendingTurn = null;
      this.pendingTurnFrames = 0;
    } else if (desiredTurn === this.pendingTurn) {
      this.pendingTurnFrames++;
      if (this.pendingTurnFrames >= TURN_COMMIT_FRAMES) {
        this.committedTurn = desiredTurn;
        this.pendingTurn = null;
        this.pendingTurnFrames = 0;
      }
    } else {
      this.pendingTurn = desiredTurn;
      this.pendingTurnFrames = 1;
    }

    this.controls.left = this.committedTurn === "left"; //Apply committed turn
    this.controls.right = this.committedTurn === "right";
  }

  //Emergency failsafe for collision avoidance
  #applyEmergencyFailsafe() {
    const readings = this.sensor.readings;
    if (readings.length === 0) return;

    const HARD_BRAKE_FRAME_CAP = 45; //Max frames for hard braking

    const movingBackward = this.controls.reverse && !this.controls.forward;
    const fanStart = movingBackward ? this.sensor.frontRayCount : 0;
    const fanCount = movingBackward
      ? this.sensor.rearRayCount
      : this.sensor.frontRayCount;

    const check = Car.#checkFanProximity(readings, fanStart, fanCount);

    //#Hard brake if imminent collision
    if (check.hardImminent && this.hardBrakeFrames < HARD_BRAKE_FRAME_CAP) {
      this.hardBrakeFrames++;
      if (movingBackward) {
        this.controls.forward = true;
        this.controls.reverse = false;
      } else {
        this.controls.forward = false;
        this.controls.reverse = true;
      }
      this.#commitEscape(check.steerLeft);
      return;
    }

    this.hardBrakeFrames = 0;

    //Soft brake if approaching obstacle
    if (check.softImminent) {
      if (movingBackward) {
        this.controls.reverse = false;
      } else {
        this.controls.forward = false;
      }
    }
  }

  //Commit to escape maneuver
  #commitEscape(steerLeft) {
    this.controls.left = steerLeft;
    this.controls.right = !steerLeft;
    this.committedTurn = steerLeft ? "left" : "right";
    this.pendingTurn = null;
    this.pendingTurnFrames = 0;
  }

  //Check sensor fan for obstacles
  static #checkFanProximity(readings, startIndex, count) {
    if (count === 0)
      return { softImminent: false, hardImminent: false, steerLeft: true };

    const SOFT_OFFSET = 0.35; //Soft brake threshold
    const HARD_OFFSET = 0.2; //Hard brake threshold
    const centerIndex = startIndex + (count - 1) / 2;
    const centerSpan = Math.max(1, Math.round(count * 0.18));

    //Find closest obstacle in center of fan
    let minOffset = Infinity;
    for (
      let i = Math.round(centerIndex - centerSpan);
      i <= Math.round(centerIndex + centerSpan);
      i++
    ) {
      const reading = readings[i];
      if (reading && reading.offset < minOffset) {
        minOffset = reading.offset;
      }
    }
    if (minOffset === Infinity) {
      return { softImminent: false, hardImminent: false, steerLeft: true };
    }

    //Compare clearance on left vs right
    let leftClearance = 0;
    let rightClearance = 0;
    for (let i = startIndex; i < startIndex + count; i++) {
      const clearance = readings[i] ? readings[i].offset : 1;
      if (i < centerIndex) leftClearance += clearance;
      else if (i > centerIndex) rightClearance += clearance;
    }

    return {
      softImminent: minOffset < SOFT_OFFSET,
      hardImminent: minOffset < HARD_OFFSET,
      steerLeft: leftClearance >= rightClearance, //Steer toward clearer side
    };
  }

  //Update stagnation tracking
  #updateStagnation() {
    if (!this.useBrain) return;

    if (this.y < this.bestY - Car.stagnationEpsilon) {
      this.bestY = this.y;
      this.stagnantFrames = 0;
    } else {
      this.stagnantFrames++;
      if (this.stagnantFrames > Car.stagnationFramesLimit) {
        this.damaged = true; //Mark as damaged if stagnant too long
      }
    }
  }

  //Check for collisions with road borders or traffic
  #assessDamage(roadBorders, traffic) {
    for (let i = 0; i < roadBorders.length; i++) {
      if (polysIntersect(this.polygon, roadBorders[i])) {
        return true;
      }
    }
    for (let i = 0; i < traffic.length; i++) {
      if (polysIntersect(this.polygon, traffic[i].polygon)) {
        return true;
      }
    }
    return false;
  }

  //Create collision polygon for car
  #createPolygon() {
    const points = [];
    const rad = Math.hypot(this.width, this.height) / 2;
    const alpha = Math.atan2(this.width, this.height);
    //Calculate 4 corners of rotated rectangle
    points.push({
      x: this.x - Math.sin(this.angle - alpha) * rad,
      y: this.y - Math.cos(this.angle - alpha) * rad,
    });
    points.push({
      x: this.x - Math.sin(this.angle + alpha) * rad,
      y: this.y - Math.cos(this.angle + alpha) * rad,
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle - alpha) * rad,
      y: this.y - Math.cos(Math.PI + this.angle - alpha) * rad,
    });
    points.push({
      x: this.x - Math.sin(Math.PI + this.angle + alpha) * rad,
      y: this.y - Math.cos(Math.PI + this.angle + alpha) * rad,
    });
    return points;
  }

  //Update car position based on controls
  #move() {
    //Handle acceleration
    if (this.controls.forward) {
      this.speed += this.acceleration;
    }
    if (this.controls.reverse) {
      this.speed -= this.acceleration;
    }

    //Apply speed limits
    if (this.speed > this.maxSpeed) {
      this.speed = this.maxSpeed;
    }
    if (this.speed < -this.maxSpeed / 2) {
      this.speed = -this.maxSpeed / 2;
    }

    //Apply friction
    if (this.speed > 0) {
      this.speed -= this.friction;
    }
    if (this.speed < 0) {
      this.speed += this.friction;
    }
    if (Math.abs(this.speed) < this.friction) {
      this.speed = 0;
    }

    //Handle steering (only when moving)
    if (this.speed !== 0) {
      const flip = this.speed > 0 ? 1 : -1; //Reverse steering when going backward
      if (this.controls.left) {
        this.angle += 0.035 * flip;
      }
      if (this.controls.right) {
        this.angle -= 0.035 * flip;
      }
    }

    //Update position
    this.x -= Math.sin(this.angle) * this.speed;
    this.y -= Math.cos(this.angle) * this.speed;
  }

  //Draw car on canvas
  draw(ctx, drawSensor = false) {
    if (this.sensor && drawSensor) {
      this.sensor.draw(ctx); //Draw sensor rays
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(-this.angle);

    //Draw colored mask for non-damaged cars
    if (!this.damaged) {
      ctx.drawImage(
        this.mask,
        -this.width / 2,
        -this.height / 2,
        this.width,
        this.height,
      );
      ctx.globalCompositeOperation = "multiply";
    }
    //Draw car sprite
    ctx.drawImage(
      this.img,
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height,
    );
    ctx.restore();
  }
}
