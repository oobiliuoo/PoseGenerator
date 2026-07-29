// Euler ZYX intrinsic (rz about Z, then ry about Y, then rx about X), degrees.
// Returns the XY projection of the tool Z-axis (0,0,1) after rotation, as a
// direction vector for the 2D preview arrow.
export function eulerToDirXY(rx: number, ry: number, rz: number): { dx: number; dy: number } {
  const deg2rad = Math.PI / 180;
  const ax = rx * deg2rad, ay = ry * deg2rad, az = rz * deg2rad;
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const cz = Math.cos(az), sz = Math.sin(az);
  // R = Rz(az) * Ry(ay) * Rx(ax), v=(0,0,1):
  // Rx*v = (0, -sx, cx)
  // Ry*(Rx*v) = (sy*cx, -sx, cy*cx)
  // Rz*(Ry*Rx*v) = (cz*sy*cx + sz*sx, sz*sy*cx - cz*sx, cy*cx)
  const vx = cz * sy * cx + sz * sx;
  const vy = sz * sy * cx - cz * sx;
  const len = Math.hypot(vx, vy);
  if (len < 1e-8) return { dx: 0, dy: 0 }; // vertical tool — no XY direction
  return { dx: vx / len, dy: vy / len };
}