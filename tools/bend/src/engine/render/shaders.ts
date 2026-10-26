export const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

export const SIGNAL_FIELD_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uSeed;
uniform float uSpeed;
uniform float uIntensity;
uniform float uScale;
uniform float uFrequency;
uniform float uPalette;
uniform vec4 uCrop;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed * 0.071);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

vec3 palette(float t) {
  if (uPalette < 0.5) {
    return mix(vec3(0.078, 0.078, 0.086), mix(vec3(0.780, 1.0, 0.357), vec3(0.914, 1.0, 0.702), t), t);
  }
  if (uPalette < 1.5) {
    return mix(vec3(0.09, 0.035, 0.05), mix(vec3(0.945, 0.42, 0.47), vec3(1.0, 0.75, 0.54), t), t);
  }
  if (uPalette < 2.5) {
    return mix(vec3(0.02, 0.08, 0.13), mix(vec3(0.55, 0.89, 1.0), vec3(0.90, 0.98, 1.0), t), t);
  }
  if (uPalette < 3.5) {
    return mix(vec3(0.063, 0.063, 0.078), mix(vec3(0.96, 0.95, 0.92), vec3(0.46, 0.46, 0.50), t), t);
  }
  if (uPalette < 4.5) {
    return mix(vec3(0.02, 0.02, 0.024), mix(vec3(0.96, 0.95, 0.92), vec3(0.78, 1.0, 0.36), t), t);
  }
  if (uPalette < 5.5) {
    return mix(vec3(0.07, 0.1, 0.11), mix(vec3(0.72, 0.86, 0.83), vec3(0.95, 0.76, 0.54), t), t);
  }
  return mix(vec3(0.09, 0.015, 0.13), mix(vec3(1.0, 0.31, 0.85), vec3(1.0, 0.9, 0.22), t), t);
}

void main(void) {
  vec2 uv = uCrop.xy + vTextureCoord * uCrop.zw;
  vec2 p = (uv - 0.5) * (2.0 + uScale);
  float t = uTime * uSpeed;
  float f = max(0.2, uFrequency);
  float n1 = noise(p * f + vec2(t * 0.43, -t * 0.21));
  float n2 = noise(p * f * 1.7 + vec2(-t * 0.31, t * 0.52));
  float ribbons = sin((p.x * 2.4 + n1 * 3.5 + t * 1.5) * f) * 0.5 + 0.5;
  float field = clamp((n1 * 0.56 + n2 * 0.28 + ribbons * 0.35) * uIntensity, 0.0, 1.0);
  float edge = smoothstep(0.18, 0.88, field);
  vec3 color = palette(edge);
  float grain = (hash21(gl_FragCoord.xy + uTime) - 0.5) * 0.045;
  color += grain;
  gl_FragColor = vec4(color, 1.0);
}
`;

export const FLOW_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uSeed;
uniform float uParticleDensity;
uniform float uFieldScale;
uniform float uFlowSpeed;
uniform float uCurl;
uniform float uTrailLength;
uniform float uLineWidth;
uniform float uDispersion;
uniform float uOpacity;
uniform float uPalette;
uniform vec4 uCrop;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed * 0.071);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 palette(float t) {
  if (uPalette < 0.5) return mix(vec3(0.06, 0.07, 0.08), mix(vec3(0.78, 1.0, 0.36), vec3(0.91, 1.0, 0.7), t), t);
  if (uPalette < 1.5) return mix(vec3(0.12, 0.02, 0.04), mix(vec3(0.95, 0.25, 0.34), vec3(1.0, 0.72, 0.32), t), t);
  if (uPalette < 2.5) return mix(vec3(0.02, 0.07, 0.11), mix(vec3(0.34, 0.8, 1.0), vec3(0.86, 0.96, 1.0), t), t);
  if (uPalette < 3.5) return mix(vec3(0.04), vec3(0.96), t);
  if (uPalette < 4.5) return mix(vec3(0.01), mix(vec3(0.96), vec3(0.78, 1.0, 0.36), t), t);
  if (uPalette < 5.5) return mix(vec3(0.06, 0.09, 0.1), mix(vec3(0.7, 0.86, 0.83), vec3(0.95, 0.75, 0.52), t), t);
  return mix(vec3(0.08, 0.01, 0.12), mix(vec3(1.0, 0.25, 0.85), vec3(1.0, 0.9, 0.2), t), t);
}

vec2 field(vec2 p) {
  float phase = uTime * uFlowSpeed;
  float a = sin((p.x * uFieldScale * 3.4 + uSeed) * 2.1 + phase * 0.9);
  float b = cos((p.y * uFieldScale * 3.4 - uSeed * 0.6) * 1.7 - phase * 0.65);
  float c = sin((p.x + p.y) * uFieldScale * 4.4 + phase * 0.4 + uSeed * 1.8);
  vec2 base = vec2(cos((p.y * uFieldScale * 3.4 + c + phase) * 2.2) - a * 0.35, sin((p.x * uFieldScale * 3.4 - c - phase * 0.72) * 1.9) + b * 0.35);
  vec2 orbit = vec2(0.5 - p.y, p.x - 0.5);
  return normalize(base + orbit * uCurl * 0.35 + vec2(0.0001));
}

void main(void) {
  vec2 uv = uCrop.xy + vTextureCoord * uCrop.zw;
  float density = mix(7.0, 31.0, uParticleDensity);
  vec2 local = fract(uv * density) * density;
  vec2 cell = floor(uv * density);
  float trails = 0.0;
  for (int particle = 0; particle < 5; particle++) {
    float seed = hash21(cell + float(particle) * 17.17);
    vec2 pos = vec2(seed, hash21(cell + float(particle) * 31.71)) * density;
    for (int step = 0; step < 14; step++) {
      float progress = float(step) / 13.0;
      vec2 delta = local - pos;
      float distanceToParticle = length(delta);
      float width = max(0.11, uLineWidth * 0.72 + uDispersion * 0.28) * (1.0 + progress * 0.55);
      trails += exp(-distanceToParticle * distanceToParticle / (width * width)) * (1.0 - progress) * uTrailLength;
      vec2 velocity = field((cell + pos) / density);
      pos = mod(pos + velocity * (0.34 + uTrailLength * 0.55), density);
    }
  }
  trails = clamp(trails * 0.52, 0.0, 1.0);
  // The particle pass is intentionally sparse at high resolutions. Add a
  // continuous stream-line pass so Flow remains visibly legible at export
  // resolution while retaining seeded field motion.
  float phase = uTime * uFlowSpeed;
  vec2 flowVector = field(uv);
  vec2 warped = uv + flowVector * (0.06 + uDispersion * 0.1);
  float streamPhase = (warped.x + sin(warped.y * 8.0 + phase * 0.9) * 0.11 + cos(warped.y * 3.0 - phase * 0.65) * 0.06 + phase * 0.025) * (10.0 + uParticleDensity * 18.0);
  float streamLines = 1.0 - smoothstep(0.0, 0.28 + uLineWidth * 0.3, abs(sin(streamPhase)));
  trails = max(trails, streamLines * (0.42 + uTrailLength * 0.58));
  float grain = (hash21(gl_FragCoord.xy + uTime) - 0.5) * 0.025;
  vec3 color = palette(clamp(trails + grain, 0.0, 1.0));
  color = mix(vec3(0.015, 0.016, 0.02), color, clamp(trails * uOpacity * 1.8, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
}
`;

export const REFRACTION_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uSeed;
uniform float uRefraction;
uniform float uLightIntensity;
uniform float uWaveScale;
uniform float uDistortion;
uniform float uSpeed;
uniform float uDirection;
uniform float uContrast;
uniform float uSoftness;
uniform float uPalette;
uniform vec4 uCrop;

vec3 palette(float t) {
  if (uPalette < 0.5) return mix(vec3(0.02, 0.08, 0.13), mix(vec3(0.4, 0.86, 1.0), vec3(0.9, 0.98, 1.0), t), t);
  if (uPalette < 1.5) return mix(vec3(0.11, 0.02, 0.03), mix(vec3(0.94, 0.28, 0.3), vec3(1.0, 0.72, 0.38), t), t);
  if (uPalette < 2.5) return mix(vec3(0.08, 0.01, 0.12), mix(vec3(1.0, 0.18, 0.72), vec3(1.0, 0.9, 0.22), t), t);
  if (uPalette < 3.5) return mix(vec3(0.03), vec3(0.96), t);
  if (uPalette < 4.5) return mix(vec3(0.01), mix(vec3(0.96), vec3(0.78, 1.0, 0.36), t), t);
  if (uPalette < 5.5) return mix(vec3(0.06, 0.09, 0.1), mix(vec3(0.72, 0.86, 0.83), vec3(0.95, 0.76, 0.54), t), t);
  return mix(vec3(0.08, 0.01, 0.12), mix(vec3(1.0, 0.25, 0.85), vec3(1.0, 0.9, 0.2), t), t);
}

float heightAt(vec2 p) {
  float phase = uTime * uSpeed;
  float angle = uDirection;
  vec2 axis = vec2(cos(angle), sin(angle));
  vec2 crossAxis = vec2(-axis.y, axis.x);
  float a = sin(dot(p - 0.5, axis) * uWaveScale * 17.0 + phase + uSeed);
  float b = cos(dot(p - 0.5, crossAxis) * uWaveScale * 13.0 - phase * 1.37 - uSeed * 0.7);
  float c = sin((p.x + p.y) * uWaveScale * 9.0 + phase * 0.62 + uSeed * 1.4);
  return a * 0.52 + b * 0.3 + c * 0.18;
}

void main(void) {
  vec2 uv = uCrop.xy + vTextureCoord * uCrop.zw;
  vec2 texel = vec2(0.0025);
  float h = heightAt(uv);
  float dx = heightAt(uv + vec2(texel.x, 0.0)) - heightAt(uv - vec2(texel.x, 0.0));
  float dy = heightAt(uv + vec2(0.0, texel.y)) - heightAt(uv - vec2(0.0, texel.y));
  vec3 normal = normalize(vec3(-dx * uDistortion, -dy * uDistortion, 1.0));
  vec2 lightAxis = vec2(cos(uDirection), sin(uDirection));
  vec3 light = normalize(vec3(lightAxis * 0.7, 1.0));
  float diffuse = max(0.0, dot(normal, light));
  float caustic = pow(max(0.0, sin((h + diffuse) * 10.0 + uTime * uSpeed * 2.0) * 0.5 + 0.5), mix(3.4, 0.8, uSoftness));
  float interference = sin((h * uRefraction + uv.x * 0.9 + uv.y * 1.4) * 22.0 + uTime * uSpeed) * 0.5 + 0.5;
  float signal = clamp((diffuse * 0.48 + caustic * 0.48 + interference * 0.18) * uLightIntensity, 0.0, 1.0);
  signal = pow(signal, max(0.2, 1.5 - uContrast));
  vec3 base = palette(signal);
  float chroma = uRefraction * 0.08;
  if (uPalette > 1.5 && uPalette < 2.5) {
    base.r += chroma * caustic;
    base.b += chroma * (1.0 - caustic);
  }
  base = mix(vec3(0.02, 0.02, 0.03), base, clamp(signal + uSoftness * 0.12, 0.0, 1.0));
  gl_FragColor = vec4(base, 1.0);
}
`;

export const WAVE_DISPLACEMENT_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity;
uniform float uFrequency;
uniform float uSpeed;
uniform float uDirectionX;
uniform float uDirectionY;
uniform float uPhase;

void main(void) {
  vec2 uv = vTextureCoord;
  if (uIntensity <= 0.00001) {
    gl_FragColor = texture2D(uTexture, uv);
    return;
  }
  float waveA = sin((uv.y * uFrequency * 6.28318) + uTime * uSpeed * 2.2 + uPhase);
  float waveB = cos((uv.x * uFrequency * 4.71239) - uTime * uSpeed * 1.45 + uPhase * 0.7);
  vec2 displacement = vec2(waveA, waveB) * (uIntensity * 0.065);
  displacement *= normalize(vec2(uDirectionX, uDirectionY));
  vec2 displaced = clamp(uv + displacement, 0.001, 0.999);
  gl_FragColor = texture2D(uTexture, displaced);
}
`;

export const LAYER_BLEND_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform float uMode;

vec3 blendMultiply(vec3 base, vec3 front) {
  return base * front;
}

vec3 blendScreen(vec3 base, vec3 front) {
  return 1.0 - (1.0 - base) * (1.0 - front);
}

vec3 blendAdd(vec3 base, vec3 front) {
  return min(vec3(1.0), base + front);
}

vec3 blendOverlay(vec3 base, vec3 front) {
  vec3 low = 2.0 * base * front;
  vec3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - front);
  return mix(high, low, step(base, vec3(0.5)));
}

void main(void) {
  vec4 back = texture2D(uBackTexture, vTextureCoord);
  vec4 front = texture2D(uTexture, vTextureCoord);
  float frontAlpha = clamp(front.a, 0.0, 1.0);
  vec3 frontColor = frontAlpha > 0.0001 ? front.rgb / frontAlpha : front.rgb;
  float backAlpha = clamp(back.a, 0.0, 1.0);
  vec3 backColor = backAlpha > 0.0001 ? back.rgb / backAlpha : back.rgb;
  vec3 blended;
  if (uMode < 0.5) {
    blended = frontColor;
  } else if (uMode < 1.5) {
    blended = blendMultiply(backColor, frontColor);
  } else if (uMode < 2.5) {
    blended = blendScreen(backColor, frontColor);
  } else if (uMode < 3.5) {
    blended = blendAdd(backColor, frontColor);
  } else {
    blended = blendOverlay(backColor, frontColor);
  }
  gl_FragColor = vec4(blended * frontAlpha, frontAlpha);
}
`;

export const CROP_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uCrop;

void main(void) {
  vec2 uv = clamp(uCrop.xy + vTextureCoord * uCrop.zw, vec2(0.001), vec2(0.999));
  gl_FragColor = texture2D(uTexture, uv);
}
`;



export const COLOR_GRADE_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uHue;
uniform float uTemperature;
uniform float uTint;
uniform float uHighlights;
uniform float uShadows;
uniform float uVignette;
uniform float uGrain;
uniform float uSharpen;
uniform float uTime;
uniform vec2 uTexel;

float grainHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 rotateHue(vec3 color, float angle) {
  mat3 toYIQ = mat3(
    0.299, 0.587, 0.114,
    0.596, -0.274, -0.322,
    0.211, -0.523, 0.312
  );
  mat3 toRGB = mat3(
    1.0, 0.956, 0.621,
    1.0, -0.272, -0.647,
    1.0, -1.106, 1.703
  );
  vec3 yiq = toYIQ * color;
  float cosine = cos(angle);
  float sine = sin(angle);
  yiq = vec3(yiq.x, yiq.y * cosine - yiq.z * sine, yiq.y * sine + yiq.z * cosine);
  return toRGB * yiq;
}

void main(void) {
  vec4 source = texture2D(uTexture, vTextureCoord);
  vec3 color = source.rgb;
  vec2 texel = uTexel;
  if (uSharpen > 0.0001) {
    vec3 blur = (
      texture2D(uTexture, vTextureCoord + vec2(texel.x, 0.0)).rgb +
      texture2D(uTexture, vTextureCoord - vec2(texel.x, 0.0)).rgb +
      texture2D(uTexture, vTextureCoord + vec2(0.0, texel.y)).rgb +
      texture2D(uTexture, vTextureCoord - vec2(0.0, texel.y)).rgb
    ) * 0.25;
    color = mix(color, color + (color - blur) * 1.8, uSharpen);
  }
  // Match the established ColorMatrixFilter order and hue rotation for the
  // four legacy controls, then layer the Phase 8 finishing controls on top.
  color *= 1.0 + uBrightness;
  color = (color - 0.5) * (1.0 + uContrast) + 0.5;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, 1.0 + uSaturation);
  color = rotateHue(color, uHue);
  luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color += vec3(uTemperature * 0.075, 0.0, -uTemperature * 0.075);
  color += vec3(uTint * 0.015, uTint * 0.055, -uTint * 0.055);
  float highlightWeight = smoothstep(0.35, 1.0, clamp(luma, 0.0, 1.0));
  float shadowWeight = 1.0 - smoothstep(0.0, 0.65, clamp(luma, 0.0, 1.0));
  color += vec3(uHighlights * 0.28 * highlightWeight);
  color += vec3(uShadows * 0.28 * shadowWeight);
  if (uVignette > 0.0001) {
    vec2 centered = vTextureCoord - 0.5;
    float radial = smoothstep(0.22, 0.72, length(centered) * 1.35);
    color *= 1.0 - radial * uVignette * 0.76;
  }
  if (uGrain > 0.0001) {
    float noise = grainHash(gl_FragCoord.xy * 0.85 + vec2(uTime * 17.0, -uTime * 11.0)) - 0.5;
    color += noise * uGrain * 0.16;
  }
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
}
`;

export const TRANSITION_FRAGMENT = `
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uType;
uniform float uProgress;
uniform vec2 uDirection;
uniform float uIntensity;
uniform float uTime;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main(void) {
  vec2 uv = vTextureCoord;
  float alpha = 1.0;
  if (uType < 0.5) {
    // Wave dissolve.
    float wave = sin(uv.y * 37.0 + uProgress * 13.0 + uTime * 3.0) * 0.5 + 0.5;
    uv += uDirection * (wave - 0.5) * 0.055 * uIntensity * sin(uProgress * 3.14159);
    vec2 direction = normalize(uDirection + vec2(0.0001));
    float coordinate = abs(direction.x) > abs(direction.y)
      ? (direction.x < 0.0 ? 1.0 - vTextureCoord.x : vTextureCoord.x)
      : (direction.y < 0.0 ? 1.0 - vTextureCoord.y : vTextureCoord.y);
    float edge = mix(1.12, -0.12, uProgress);
    alpha = smoothstep(edge - 0.08, edge + 0.08, coordinate);
  } else if (uType < 1.5) {
    // Procedural wave distortion under a dissolve.
    vec2 warped = uv - 0.5;
    float wave = sin(warped.y * 34.0 + uProgress * 18.0 + uTime * 5.0) * 0.01;
    warped += vec2(wave, sin(warped.x * 23.0 - uTime * 3.0) * 0.006) * uIntensity;
    uv = warped + 0.5;
  } else if (uType < 2.5) {
    // Link-style cut mask with a controlled RGB disturbance.
    vec2 direction = normalize(uDirection + vec2(0.0001));
    float coordinate = abs(direction.x) > abs(direction.y)
      ? (direction.x < 0.0 ? 1.0 - vTextureCoord.x : vTextureCoord.x)
      : (direction.y < 0.0 ? 1.0 - vTextureCoord.y : vTextureCoord.y);
    float edge = mix(1.12, -0.12, uProgress);
    alpha = smoothstep(edge - 0.055, edge + 0.055, coordinate);
    vec2 glitched = uv;
    glitched.x += (hash(vec2(floor(uTime * 34.0), floor(uv.y * 30.0))) - 0.5) * 0.028 * uIntensity;
    uv = glitched;
  }
  vec4 source = texture2D(uTexture, clamp(uv, vec2(0.001), vec2(0.999)));
  if (uType > 1.5 && uType < 2.5) {
    float shift = 0.0045 * uIntensity;
    vec4 red = texture2D(uTexture, clamp(uv + vec2(shift, 0.0), vec2(0.001), vec2(0.999)));
    vec4 blue = texture2D(uTexture, clamp(uv - vec2(shift, 0.0), vec2(0.001), vec2(0.999)));
    source = vec4(red.r, source.g, blue.b, source.a);
    float scan = sin(vTextureCoord.y * 900.0 + uTime * 45.0) * 0.5 + 0.5;
    source.rgb *= 1.0 + (scan - 0.5) * 0.06 * uIntensity;
  }
  gl_FragColor = vec4(source.rgb, source.a * alpha);
}
`;
