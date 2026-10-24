import QRCode from "qrcode";

export interface Matrix { size: number; dark(x: number, y: number): boolean }

export function qrMatrix(text: string): Matrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  return { size: modules.size, dark: (x, y) => Boolean(modules.data[y * modules.size + x]) };
}

/** Draws crisp modules (no anti-aliasing seams) with a quiet zone of `quiet` modules. */
export function drawQr(context: { fillRect(x: number, y: number, w: number, h: number): void; fillStyle: unknown }, matrix: Matrix, x: number, y: number, size: number, quiet = 2) {
  const cell = Math.floor(size / (matrix.size + quiet * 2));
  const offset = Math.floor((size - cell * matrix.size) / 2);
  for (let row = 0; row < matrix.size; row++) for (let column = 0; column < matrix.size; column++) {
    if (matrix.dark(column, row)) context.fillRect(x + offset + column * cell, y + offset + row * cell, cell, cell);
  }
  return cell;
}
