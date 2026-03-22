import React, { useRef, useEffect } from 'react';

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  label?: string;
  className?: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length < 3) return null;
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}

export default function Sparkline({ data, color, width = 120, height = 30, label, className }: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    if (data.length < 2) return;

    const xStep = width / (data.length - 1);
    const getY = (v: number) => height - (Math.max(0, Math.min(100, v)) / 100) * height;

    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * xStep;
      const y = getY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineTo((data.length - 1) * xStep, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const rgb = hexToRgb(color);
    ctx.fillStyle = rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)` : 'rgba(0,240,255,0.15)';
    ctx.fill();

    if (label) {
      ctx.font = '8px monospace';
      ctx.fillStyle = color;
      ctx.fillText(label, 2, 8);
    }
  }, [data, color, width, height, label]);

  return <canvas ref={canvasRef} style={{ width, height }} className={className} />;
}
