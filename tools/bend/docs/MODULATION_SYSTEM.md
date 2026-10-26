# BEND modulation system

Modulation is a single deterministic signal attached to an animation track. It is deliberately property-local; there is no node graph in Phase 4.

## Signal types

- `sine`: periodic signed sine wave.
- `triangle`: periodic signed triangle wave.
- `pulse`: signed pulse with a serialized duty cycle.
- `smooth-noise`: seeded value noise interpolated between integer cells.
- `ramp`: a deterministic start-to-end ramp over a serialized duration.

The evaluator serializes frequency, amplitude, offset, phase, duty cycle, intensity, seed, smoothness, start, end, duration, and easing. The same document and timestamp produce the same value.

## Combination

For a base/keyframed value `b` and modulation signal `m`:

- `add`: `b + m`
- `multiply`: `b * (1 + m)`
- `replace`: `m`

The result is clamped using the property's definition. Modulators do not silently change enum, boolean, seed, quality, or structural properties.

## Stateful generators

Liquid remains a fixed-step CPU simulation. The renderer supplies animated Liquid parameters at each simulation step, then uses the existing bounded checkpoint/replay mechanism when the playhead moves backward. A changed seed, quality, or source animation document invalidates the simulation state. Numeric modulation changes the path of the replayed simulation and is not applied as a post-process.

## UX

The `MOD` control creates or removes the one modulator for a track. Its compact editor exposes waveform, combination mode, frequency, amplitude, bypass, and removal. The timeline marks modulated tracks with a signal band.
