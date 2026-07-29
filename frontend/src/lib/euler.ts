// Euler ZYX intrinsic (rz about Z, then ry about Y, then rx about X), degrees.
// Returns the tool Z-axis (0,0,1) after rotation as a 3D unit-ish vector.

export interface Vec3 { vx: number; vy: number; vz: number; }

export function eulerToVec(rx: number, ry: number, rz: number): Vec3 {
  const d = Math.PI / 180;
  const ax = rx * d, ay = ry * d, az = rz * d;
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const cy = Math.cos(ay), sy = Math.sin(ay);
  const cz = Math.cos(az), sz = Math.sin(az);
  // R = Rz(az) * Ry(ay) * Rx(ax), v=(0,0,1)
  // Rx*v = (0, -sx, cx)
  // Ry*(Rx*v) = (sy*cx, -sx, cy*cx)
  // Rz*(Ry*Rx*v) = (cz*sy*cx + sz*sx, sz*sy*cx - cz*sx, cy*cx)
  return {
    vx: cz * sy * cx + sz * sx,
    vy: sz * sy * cx - cz * sx,
    vz: cy * cx,
  };
}

/** XY-plane projection of the tool direction. Returns a normalized 2D vector. */
export function eulerToDirXY(rx: number, ry: number, rz: number): { dx: number; dy: number } {
  const v = eulerToVec(rx, ry, rz);
  const len = Math.hypot(v.vx, v.vy);
  if (len < 1e-8) return { dx: 0, dy: 0 };
  return { dx: v.vx / len, dy: v.vy / len };
}