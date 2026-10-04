/** Geometry used to reconstruct editable text and simple ruled tables. Coordinates are points. */
export interface PdfTextBox {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  font: string;
  bold: boolean;
  italic: boolean;
  color: string;
}

export interface PdfLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface PdfGrid {
  xs: number[];
  ys: number[];
}
type Matrix = number[];

export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** PDF.js 5.x compact drawing paths. Curves are skipped, never interpreted as table rules. */
export function extractRules(
  ops: { fnArray: number[]; argsArray: any[] },
  codes: Record<string, number>,
  viewport: Matrix,
): PdfLine[] {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const lines: PdfLine[] = [];
  const add = (a: number[], b: number[]) => {
    const m = multiply(viewport, matrix);
    const point = (p: number[]) => [
      m[0] * p[0] + m[2] * p[1] + m[4],
      m[1] * p[0] + m[3] * p[1] + m[5],
    ];
    const [x1, y1] = point(a),
      [x2, y2] = point(b);
    if (
      [x1, y1, x2, y2].every(Number.isFinite) &&
      (Math.abs(x1 - x2) < 0.5 || Math.abs(y1 - y2) < 0.5)
    )
      lines.push({ x1, y1, x2, y2 });
  };
  for (let n = 0; n < ops.fnArray.length; n++) {
    const code = ops.fnArray[n],
      args = ops.argsArray[n];
    if (code === codes.save || code === codes.paintFormXObjectBegin) {
      stack.push([...matrix]);
      if (code === codes.paintFormXObjectBegin && args[0])
        matrix = multiply(matrix, args[0]);
    } else if (code === codes.restore || code === codes.paintFormXObjectEnd) {
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (code === codes.transform) {
      matrix = multiply(matrix, args);
    } else if (
      code === codes.constructPath &&
      [
        codes.stroke,
        codes.closeStroke,
        codes.fillStroke,
        codes.eoFillStroke,
        codes.closeFillStroke,
        codes.closeEOFillStroke,
      ].includes(args[0])
    ) {
      const data = args[1]?.[0];
      if (!data || typeof data.length !== "number") continue;
      let current = [0, 0],
        start = current;
      for (let i = 0; i < data.length; ) {
        const op = data[i++];
        if (op === 0) {
          current = [data[i++], data[i++]];
          start = current;
        } else if (op === 1) {
          const next = [data[i++], data[i++]];
          add(current, next);
          current = next;
        } else if (op === 2) {
          i += 4;
          current = [data[i++], data[i++]];
        } else if (op === 3) {
          i += 2;
          current = [data[i++], data[i++]];
        } else if (op === 4) {
          add(current, start);
          current = start;
        } else break;
      }
    }
  }
  return lines;
}

const unique = (values: number[]) =>
  values
    .sort((a, b) => a - b)
    .filter((value, i, all) => !i || value - all[i - 1] > 1);

/** Only complete rectangular grids: no guesses about borderless or merged-cell tables. */
export function detectGrids(lines: PdfLine[]): PdfGrid[] {
  const horizontal = lines.filter(
    (l) => Math.abs(l.y1 - l.y2) < 0.5 && Math.abs(l.x1 - l.x2) > 10,
  );
  const vertical = lines.filter(
    (l) => Math.abs(l.x1 - l.x2) < 0.5 && Math.abs(l.y1 - l.y2) > 10,
  );
  const grids: PdfGrid[] = [];
  for (const line of horizontal) {
    const left = Math.min(line.x1, line.x2),
      right = Math.max(line.x1, line.x2);
    const ys = unique(
      horizontal
        .filter(
          (l) =>
            Math.abs(Math.min(l.x1, l.x2) - left) < 1 &&
            Math.abs(Math.max(l.x1, l.x2) - right) < 1,
        )
        .map((l) => l.y1),
    );
    if (ys.length < 3) continue;
    const top = ys[0],
      bottom = ys[ys.length - 1];
    const xs = unique(
      vertical
        .filter(
          (l) =>
            l.x1 >= left - 1 &&
            l.x1 <= right + 1 &&
            Math.min(l.y1, l.y2) <= top + 1 &&
            Math.max(l.y1, l.y2) >= bottom - 1,
        )
        .map((l) => l.x1),
    );
    if (
      xs.length < 3 ||
      Math.abs(xs[0] - left) > 1 ||
      Math.abs(xs[xs.length - 1] - right) > 1
    )
      continue;
    if (xs.length * ys.length > 2500) continue;
    if (
      grids.some(
        (g) =>
          left < g.xs[g.xs.length - 1] &&
          right > g.xs[0] &&
          top < g.ys[g.ys.length - 1] &&
          bottom > g.ys[0],
      )
    )
      continue;
    grids.push({ xs, ys });
  }
  return grids;
}

export function insideGrid(box: PdfTextBox, grid: PdfGrid): boolean {
  return (
    box.x >= grid.xs[0] &&
    box.x + box.width <= grid.xs[grid.xs.length - 1] + 1 &&
    box.y >= grid.ys[0] &&
    box.y + box.size <= grid.ys[grid.ys.length - 1] + 1
  );
}
