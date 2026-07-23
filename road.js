class Road {
  constructor(x, width, laneCount = 3) {
    this.x = x;
    this.width = width;
    this.laneCount = laneCount;

    this.left = x - width / 2;
    this.right = x + width / 2;

    //Road stretches forever vertically
    const infinity = 1000000;
    this.top = -infinity;
    this.bottom = infinity;

    const topLeft = { x: this.left, y: this.top };
    const topRight = { x: this.right, y: this.top };
    const bottomLeft = { x: this.left, y: this.bottom };
    const bottomRight = { x: this.right, y: this.bottom };

    //Only outer edges are collidable borders
    this.borders = [
      [topLeft, bottomLeft],
      [topRight, bottomRight],
    ];
  }

  //Get x-coordinate of lane center
  getLaneCenter(laneIndex) {
    const laneWidth = this.width / this.laneCount;
    return (
      this.left +
      laneWidth / 2 +
      Math.min(laneIndex, this.laneCount - 1) * laneWidth
    );
  }

  //Draw road, shoulders, lane dividers, and borders
  draw(ctx) {
    const shoulderWidth = 18;

    //Grass shoulders
    ctx.fillStyle = "#3f7d3a";
    ctx.fillRect(
      this.left - shoulderWidth,
      this.top,
      shoulderWidth,
      this.bottom - this.top,
    );
    ctx.fillRect(this.right, this.top, shoulderWidth, this.bottom - this.top);

    //Asphalt surface
    ctx.fillStyle = "#4a4a4f";
    ctx.fillRect(this.left, this.top, this.width, this.bottom - this.top);

    //Dashed lane dividers
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    for (let i = 1; i <= this.laneCount - 1; i++) {
      const x = lerp(this.left, this.right, i / this.laneCount);

      ctx.setLineDash([22, 18]);
      ctx.beginPath();
      ctx.moveTo(x, this.top);
      ctx.lineTo(x, this.bottom);
      ctx.stroke();
    }

    //Solid edge lines (collidable borders)
    ctx.setLineDash([]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#ffffff";
    this.borders.forEach((border) => {
      ctx.beginPath();
      ctx.moveTo(border[0].x, border[0].y);
      ctx.lineTo(border[1].x, border[1].y);
      ctx.stroke();
    });
  }
}
