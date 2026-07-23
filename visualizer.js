class Visualizer {
  //Draw full network diagram
  static drawNetwork(ctx, network) {
    Visualizer.#drawPanel(ctx);

    const margin = 40;
    const topReserved = 46;
    const bottomReserved = 46;
    const inputRowGap = 30;
    const left = margin;
    const top = margin + topReserved;
    const width = ctx.canvas.width - margin * 2;
    const height =
      ctx.canvas.height -
      margin * 2 -
      topReserved -
      bottomReserved -
      inputRowGap;

    //Find widest row for node sizing
    const inputLevel = network.levels[0];
    const effectiveInputRowSize = Math.ceil(inputLevel.inputs.length / 2);
    const widestRow = Math.max(
      effectiveInputRowSize,
      ...network.levels.map((l) => l.outputs.length),
    );
    const nodeRadius = Visualizer.#computeNodeRadius(width, widestRow);

    const levelHeight = height / network.levels.length;

    //Draw levels from output to input (bottom to top)
    for (let i = network.levels.length - 1; i >= 0; i--) {
      const levelTop =
        top +
        lerp(
          height - levelHeight,
          0,
          network.levels.length === 1 ? 0.5 : i / (network.levels.length - 1),
        );

      ctx.setLineDash([6, 3]);
      Visualizer.drawLevel(
        ctx,
        network.levels[i],
        left,
        levelTop,
        width,
        levelHeight + (i === 0 ? inputRowGap : 0),
        i === network.levels.length - 1 ? ["🠉", "🠈", "🠊", "🠋"] : [],
        nodeRadius,
        i === 0,
      );
    }

    Visualizer.#drawCaptions(ctx, left, top, width, height + inputRowGap);
    Visualizer.#drawTitleAndLegend(ctx);
  }

  //Compute node radius to prevent overlap
  static #computeNodeRadius(width, widestRowCount) {
    if (widestRowCount <= 1) return 16;
    const spacing = width / (widestRowCount - 1);
    return clamp(spacing / 2 - 3, 11, 22);
  }

  //Draw panel background
  static #drawPanel(ctx) {
    const { width, height } = ctx.canvas;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#12141c");
    gradient.addColorStop(1, "#05060a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, width - 16, height - 16);
  }

  //Draw title and color legend
  static #drawTitleAndLegend(ctx) {
    const { width } = ctx.canvas;

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 15px Arial";
    ctx.fillText("Neural Network", 16, 26);

    const legendItems = [
      { label: "excitatory", color: "rgba(251,191,36,0.9)" },
      { label: "inhibitory", color: "rgba(56,189,248,0.9)" },
    ];
    ctx.font = "11px Arial";
    let x = width - 16;
    for (let i = legendItems.length - 1; i >= 0; i--) {
      const item = legendItems[i];
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(item.label, x, 22);
      const textWidth = ctx.measureText(item.label).width;
      x -= textWidth + 8;
      ctx.beginPath();
      ctx.arc(x, 18, 4, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      x -= 16;
    }
  }

  //Draw input captions
  static #drawCaptions(ctx, left, top, width, height) {
    ctx.textAlign = "center";
    ctx.font = "11px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("Sensor readings", left + width / 2, top + height + 30);
  }

  //Draw one network level
  static drawLevel(
    ctx,
    level,
    left,
    top,
    width,
    height,
    outputLabels,
    nodeRadius,
    splitInputRow,
  ) {
    const right = left + width;
    const outputY = top;
    const { inputs, outputs, weights, biases } = level;

    const half = Math.ceil(inputs.length / 2);
    const subRowGap = nodeRadius * 2 + 10;
    const inputBottomY = top + height;
    const inputTopSubRowY = splitInputRow
      ? inputBottomY - subRowGap
      : inputBottomY;

    const inputY = (index) =>
      splitInputRow && index >= half ? inputTopSubRowY : inputBottomY;
    const inputX = (index) => {
      if (!splitInputRow) {
        return Visualizer.#getNodeX(inputs.length, index, left, right);
      }
      return index < half
        ? Visualizer.#getNodeX(half, index, left, right)
        : Visualizer.#getNodeX(inputs.length - half, index - half, left, right);
    };

    //Draw connections first (so nodes appear on top)
    for (let i = 0; i < inputs.length; i++) {
      const x1 = inputX(i);
      const y1 = inputY(i);
      for (let j = 0; j < outputs.length; j++) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(
          Visualizer.#getNodeX(outputs.length, j, left, right),
          outputY,
        );
        ctx.lineWidth = 1;
        ctx.strokeStyle = getRGBA(weights[i][j]);
        ctx.stroke();
      }
    }

    //Draw input neurons
    for (let i = 0; i < inputs.length; i++) {
      Visualizer.#drawNode(ctx, inputX(i), inputY(i), nodeRadius, inputs[i]);
    }

    //Draw output neurons with bias rings
    for (let i = 0; i < outputs.length; i++) {
      const x = Visualizer.#getNodeX(outputs.length, i, left, right);
      Visualizer.#drawNode(ctx, x, outputY, nodeRadius, outputs[i]);

      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.arc(x, outputY, nodeRadius * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = getRGBA(biases[i]);
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (outputLabels[i]) {
        ctx.beginPath();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = outputs[i] ? "#0a0a0a" : "white";
        ctx.font = Math.max(10, nodeRadius * 1.4) + "px Arial";
        ctx.fillText(outputLabels[i], x, outputY + nodeRadius * 0.1);
      }
    }
  }

  //Draw single neuron node
  static #drawNode(ctx, x, y, radius, activation) {
    if (activation) {
      ctx.save();
      ctx.shadowColor = "rgba(251,191,36,0.9)";
      ctx.shadowBlur = Math.max(6, radius);
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#111318";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = getRGBA(activation);
    ctx.fill();

    if (activation) {
      ctx.restore();
    }
  }

  //Get x position for node in row
  static #getNodeX(count, index, left, right) {
    return lerp(left, right, count === 1 ? 0.5 : index / (count - 1));
  }
}
