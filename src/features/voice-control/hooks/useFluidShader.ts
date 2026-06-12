"use client";

import { useEffect, useRef } from "react";

import type { MarketStyle } from "@/shared/constants/marketStyles";

/**
 * Fluid Shader Hook — 用 WebGL 在 canvas 上画"粘稠流体光晕"。
 * Why: 替换 SVG feTurbulence (低频抖动且 CPU heavy),
 * GPU 着色器拿到 marketStyle.palette 三色 + 麦克风音量 + 听写状态后
 * 实时合成赛博朋克风波纹, 整块逻辑独立成 hook 让组件保持简洁。
 */
const VERTEX_SRC = `attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/**
 * Fragment shader — 改自 stitch 的 ANIMATION_1。
 * - u_color1/2/3: 来自 marketStyle.palette, 替代硬编码紫/靛/青
 * - u_volume: 麦克风 RMS 强度 (0..1) 驱动光晕亮度
 * - u_listening: 0/1 控制动画速率, 未录音时降速 70%
 * - u_lightMode: 0/1, light 主题下输出反色背景, 避免亮主题中纯黑光晕断层
 */
const FRAGMENT_SRC = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform float u_volume;
uniform float u_listening;
uniform float u_lightMode;
varying vec2 v_uv;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = v_uv;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;

  float dist = length(p);
  float speed = mix(0.3, 1.0, u_listening);
  float t = u_time * speed;

  float noise1 = snoise(p * 1.5 + t * 0.4);
  float noise2 = snoise(p * 2.5 - t * 0.6);

  float wave = sin(dist * 10.0 - t * 2.0 + noise1 * 2.0);
  float volumeBoost = 1.0 + u_volume * 4.0;
  float glow = 0.05 / abs(dist - 0.5 + noise2 * 0.1) * volumeBoost;

  vec3 color = mix(u_color1, u_color2, 0.5 + 0.5 * sin(t * 0.5));
  color = mix(color, u_color3, noise1 * 0.5 + 0.5);

  float mask = smoothstep(0.7, 0.2, dist + noise1 * 0.05);
  vec3 finalColor = color * glow * mask;

  float r = snoise(p * 1.2 + t * 0.1);
  finalColor.r += 0.1 * smoothstep(0.5, 0.6, dist + r * 0.05);

  // light 主题: 反色 + 整体提亮, 让光晕在亮背景上仍可见
  if (u_lightMode > 0.5) {
    finalColor = vec3(1.0) - finalColor * 0.7;
  }

  gl_FragColor = vec4(finalColor, mask * 0.85);
}`;

const hexToRgb = (hex: string): [number, number, number] => {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return [1, 1, 1];
  return [parseInt(m[0]!, 16) / 255, parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255];
};

interface UseFluidShaderArgs {
  canvas: HTMLCanvasElement | null;
  style: MarketStyle;
  volume: number;
  listening: boolean;
}

export const useFluidShader = ({ canvas, style, volume, listening }: UseFluidShaderArgs) => {
  // 每帧需要最新值, 用 ref 跨 RAF 闭包
  const stateRef = useRef({ style, volume, listening });
  stateRef.current = { style, volume, listening };

  useEffect(() => {
    if (!canvas) return;
    const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    if (!gl) return;
    const glCtx = gl as WebGLRenderingContext;

    const syncSize = (): void => {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.floor(w * dpr);
      const targetH = Math.floor(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    const compile = (type: number, src: string): WebGLShader | null => {
      const s = glCtx.createShader(type);
      if (!s) return null;
      glCtx.shaderSource(s, src);
      glCtx.compileShader(s);
      return s;
    };

    const vs = compile(glCtx.VERTEX_SHADER, VERTEX_SRC);
    const fs = compile(glCtx.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vs || !fs) return;
    const prog = glCtx.createProgram();
    if (!prog) return;
    glCtx.attachShader(prog, vs);
    glCtx.attachShader(prog, fs);
    glCtx.linkProgram(prog);
    glCtx.useProgram(prog);

    const buf = glCtx.createBuffer();
    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, buf);
    glCtx.bufferData(
      glCtx.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      glCtx.STATIC_DRAW,
    );
    const pos = glCtx.getAttribLocation(prog, "a_position");
    glCtx.enableVertexAttribArray(pos);
    glCtx.vertexAttribPointer(pos, 2, glCtx.FLOAT, false, 0, 0);

    const uTime = glCtx.getUniformLocation(prog, "u_time");
    const uRes = glCtx.getUniformLocation(prog, "u_resolution");
    const uC1 = glCtx.getUniformLocation(prog, "u_color1");
    const uC2 = glCtx.getUniformLocation(prog, "u_color2");
    const uC3 = glCtx.getUniformLocation(prog, "u_color3");
    const uVol = glCtx.getUniformLocation(prog, "u_volume");
    const uListen = glCtx.getUniformLocation(prog, "u_listening");
    const uLight = glCtx.getUniformLocation(prog, "u_lightMode");

    glCtx.enable(glCtx.BLEND);
    glCtx.blendFunc(glCtx.SRC_ALPHA, glCtx.ONE_MINUS_SRC_ALPHA);

    let raf = 0;
    let mounted = true;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncSize) : null;
    ro?.observe(canvas);
    syncSize();

    const render = (t: number): void => {
      if (!mounted) return;
      if (!ro) syncSize();
      glCtx.viewport(0, 0, canvas.width, canvas.height);
      const { style: s, volume: v, listening: l } = stateRef.current;
      const [r1, g1, b1] = hexToRgb(s.palette[0]);
      const [r2, g2, b2] = hexToRgb(s.palette[1]);
      const [r3, g3, b3] = hexToRgb(s.palette[2]);
      if (uTime) glCtx.uniform1f(uTime, t * 0.001);
      if (uRes) glCtx.uniform2f(uRes, canvas.width, canvas.height);
      if (uC1) glCtx.uniform3f(uC1, r1, g1, b1);
      if (uC2) glCtx.uniform3f(uC2, r2, g2, b2);
      if (uC3) glCtx.uniform3f(uC3, r3, g3, b3);
      if (uVol) glCtx.uniform1f(uVol, Math.min(Math.max(v, 0), 1));
      if (uListen) glCtx.uniform1f(uListen, l ? 1 : 0);
      if (uLight) glCtx.uniform1f(uLight, s.ui.mode === "light" ? 1 : 0);
      glCtx.drawArrays(glCtx.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      glCtx.deleteProgram(prog);
      glCtx.deleteShader(vs);
      glCtx.deleteShader(fs);
      if (buf) glCtx.deleteBuffer(buf);
    };
  }, [canvas]);
};
