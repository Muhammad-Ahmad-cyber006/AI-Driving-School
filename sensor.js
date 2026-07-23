class Sensor {
  constructor(car) {
    this.car = car;

    // Forward fan
    this.frontRayCount = 11;
    this.frontRayLength = 300;
    this.frontRaySpread = Math.PI * 0.85;

    // Rear fan
    this.rearRayCount = 5;
    this.rearRayLength = 150;
    this.rearRaySpread = Math.PI * 0.6;

    this.rayCount = this.frontRayCount + this.rearRayCount;
    this.rays = []; // Array of [start, end] points for each ray
    this.readings = []; // Array of intersection points or null
    this.closingRates = new Array(this.rayCount).fill(0); // Rate of distance change
    this.#previousDistances = new Array(this.rayCount).fill(0);

    // Initialize previous distances to max ray lengths
    for (let i = 0; i < this.frontRayCount; i++) {
      this.#previousDistances[i] = this.frontRayLength;
    }
    for (let i = this.frontRayCount; i < this.rayCount; i++) {
      this.#previousDistances[i] = this.rearRayLength;
    }
  }

  #previousDistances; // Stores last frames distances for rate calculation

  update(roadBorders, traffic) {
    this.#castRays(); // Update ray positions
    this.readings = [];

    for (let i = 0; i < this.rays.length; i++) {
      this.readings.push(
        this.#getReading(this.rays[i], roadBorders, traffic), // Find closest obstacle
      );
    }
    this.#updateClosingRates(); // Calculate how fast obstacles are approaching
  }

  #updateClosingRates() {
    const NORMALIZER = 9; // Scale factor to normalize rates to [-1,1]
    for (let i = 0; i < this.rayCount; i++) {
      const reading = this.readings[i];
      const rayLength =
        i < this.frontRayCount ? this.frontRayLength : this.rearRayLength;
      const currentDistance = reading
        ? Math.hypot(
            reading.x - this.rays[i][0].x,
            reading.y - this.rays[i][0].y,
          )
        : rayLength;

      const rate = this.#previousDistances[i] - currentDistance;
      this.closingRates[i] = clamp(rate / NORMALIZER, -1, 1); // Normalize to [-1,1]
      this.#previousDistances[i] = currentDistance;
    }
  }

  #getReading(ray, roadBorders, traffic) {
    let touches = [];

    // Check intersections with road borders
    for (let i = 0; i < roadBorders.length; i++) {
      const touch = getIntersection(
        ray[0],
        ray[1],
        roadBorders[i][0],
        roadBorders[i][1],
      );
      if (touch) {
        touches.push(touch);
      }
    }

    // Check intersections with traffic cars
    for (let i = 0; i < traffic.length; i++) {
      const poly = traffic[i].polygon;
      for (let j = 0; j < poly.length; j++) {
        const value = getIntersection(
          ray[0],
          ray[1],
          poly[j],
          poly[(j + 1) % poly.length],
        );
        if (value) {
          touches.push(value);
        }
      }
    }

    if (touches.length === 0) {
      return null; // No obstacles detected
    }

    // Find closest intersection
    const offsets = touches.map((e) => e.offset);
    const minOffset = Math.min(...offsets);
    return touches.find((e) => e.offset === minOffset);
  }

  #castRays() {
    this.rays = [];
    this.#castFan(
      this.frontRayCount,
      this.frontRaySpread,
      this.frontRayLength,
      this.car.angle,
    );
    this.#castFan(
      this.rearRayCount,
      this.rearRaySpread,
      this.rearRayLength,
      this.car.angle + Math.PI,
    );
  }

  #castFan(count, spread, length, centerAngle) {
    for (let i = 0; i < count; i++) {
      const rayAngle =
        lerp(spread / 2, -spread / 2, count === 1 ? 0.5 : i / (count - 1)) +
        centerAngle;

      const start = { x: this.car.x, y: this.car.y };
      const end = {
        x: this.car.x - Math.sin(rayAngle) * length,
        y: this.car.y - Math.cos(rayAngle) * length,
      };
      this.rays.push([start, end]);
    }
  }

  draw(ctx) {
    for (let i = 0; i < this.rayCount; i++) {
      let end = this.rays[i][1];
      if (this.readings[i]) {
        end = this.readings[i];
      }

      // Draw ray to obstacle (or max length)
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = i < this.frontRayCount ? "yellow" : "orange"; // Front=yellow, rear=orange
      ctx.moveTo(this.rays[i][0].x, this.rays[i][0].y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Draw remaining ray segment (if hit something)
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "black";
      ctx.moveTo(this.rays[i][1].x, this.rays[i][1].y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }
}
