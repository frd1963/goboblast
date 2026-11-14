# GoboBlast

A browser page meant to be projected onto a floor or wall. The stage is pure black. The only light is a text gobo you write yourself: words, color, size, font, outline, spacing, alignment, a soft glow, and rotation.

Size is a percentage of the shorter side of the viewport, so the lettering keeps the same scale when the browser is fullscreen on a projector.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:4317](http://localhost:4317).

## How to use it

- Click the black stage, or press a key that is not already assigned, to open the control panel.
- Esc closes the panel. F toggles browser fullscreen.
- Drag Rotation left of center for a counterclockwise spin and right of center for a clockwise spin. The middle is 0°/s, so the gobo holds its angle. The slider sets that speed directly, up to 180°/s.
- Left and right arrows add 15°/s on top of the slider and do not open the panel. Opposite presses slow the spin and can reverse it.
- While a text field, menu, or slider in the panel is focused, those keys stay with the control.
- The panel hides after 4 seconds without a pointer move, key press, or control change. Any of those resets the timer.
- Settings are saved in this browser and restored on the next visit.
- Clear the gobo text for a pure black frame. With the panel hidden, the cursor is hidden too.

The panel uses the same dark slate controls as [Fotoblast](https://github.com/frd1963/fotoblast): translucent navy card, compact uppercase title, and slate inputs.
