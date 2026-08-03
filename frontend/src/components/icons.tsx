import type { ReactNode } from 'react';

/**
 * PoseGenerator 图标库
 *
 * 设计规格(与 AddNodeMenu ICONS 严格一致,沿用 Linear/Vercel 极简工程风格):
 *  - viewBox: 0 0 24 24
 *  - stroke: currentColor, strokeWidth: 1.5
 *  - strokeLinecap / strokeLinejoin: round
 *  - fill: none (实心点/三角例外)
 *  - 通过 CSS color / var(--arc) / var(--data) 控色
 *
 * 命名按"功能语义"而非"视觉比喻",便于跨场景复用。
 */

export const ICONS: Record<string, ReactNode> = {
  // ─── 品牌 mark ─────────────────────────────────
  // 三节点流水线 —— 隐喻 PoseGenerator 的核心动作:输入 → 算法 → 输出
  // 圆点用 fill 表示节点,stroke 短线表示流
  brand: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 12 H10 M14 12 H17" />
    </svg>
  ),

  // ─── 运行全部 ──────────────────────────────────
  // play in circle —— 经典播放语义,外圈突出"动作"边界
  play: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5 L16 12 L10 15.5 Z" fill="currentColor" />
    </svg>
  ),

  // ─── 保存当前(预设 / 流水线)────────────────────
  // 容器 + 内部向下箭头 —— "把东西收存进来"
  // 区别于传统软盘:更现代,且语义直白
  save: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5 H17 L19 7 V19 H5 Z" />
      <path d="M12 9 V15" />
      <path d="M9 12 L12 15 L15 12" />
    </svg>
  ),

  // ─── 推送到 pathview ──────────────────────────
  // 极简纸飞机 —— 区别于 AddNodeMenu.export(出箱)
  // 强调"从一个地方飞向另一个地方"的传输感
  send: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3 L3 11 L10 14 L13 21 Z" />
      <path d="M10 14 L21 3" />
    </svg>
  ),
};

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  /** 图标渲染尺寸(像素),默认 16。SVG 内部 viewBox 固定 24。 */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

/**
 * 通用图标渲染器。
 *
 * 用法:
 *   <Icon name="play" />                        // 默认 16px,继承 currentColor
 *   <Icon name="brand" size={26} className="..." />
 *   <Icon name="send" title="推送到 pathview" />  // 带 a11y 标题
 */
export function Icon({ name, size = 16, className, style, title }: IconProps) {
  const node = ICONS[name];
  if (!node) return null;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        lineHeight: 0,
        flexShrink: 0,
        ...style,
      }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {node}
    </span>
  );
}
