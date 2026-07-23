class Controls {
  constructor(type) {
    this.forward = false; //Forward control state
    this.left = false; //Left turn control state
    this.right = false; //Right turn control state
    this.reverse = false; //Reverse control state

    switch (type) {
      case "KEYS":
        this.#addKeyboardListeners(); //Setup keyboard controls
        break;
      case "DUMMY":
        this.forward = true; //Dummy cars always move forward
        break;
      //AI: Controls set by neural network in Car.update()
    }
  }

  //Setup keyboard event listeners
  #addKeyboardListeners() {
    const keyDownHandlers = {
      ArrowLeft: () => (this.left = true),
      ArrowRight: () => (this.right = true),
      ArrowUp: () => (this.forward = true),
      ArrowDown: () => (this.reverse = true),
      a: () => (this.left = true),
      d: () => (this.right = true),
      w: () => (this.forward = true),
      s: () => (this.reverse = true),
    };
    const keyUpHandlers = {
      ArrowLeft: () => (this.left = false),
      ArrowRight: () => (this.right = false),
      ArrowUp: () => (this.forward = false),
      ArrowDown: () => (this.reverse = false),
      a: () => (this.left = false),
      d: () => (this.right = false),
      w: () => (this.forward = false),
      s: () => (this.reverse = false),
    };

    //Listen for key presses on entire document
    document.addEventListener("keydown", (event) => {
      keyDownHandlers[event.key]?.();
    });
    document.addEventListener("keyup", (event) => {
      keyUpHandlers[event.key]?.();
    });
  }
}
