# GoboBlast

A browser page meant to be projected onto a floor or wall. The stage is pure black. The light is a gobo you make yourself: words, or a picture you upload, with size, spin, and the projector's keystone.

Size is a percentage of the shorter side of the viewport, so the lettering keeps the same scale when the browser is fullscreen on a projector.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:4317](http://localhost:4317).

## Run with Docker

The image is a multi-stage build. It installs from the lockfile, runs `next build` with standalone output, and starts that server as a non-root user. `PORT` defaults to 4317 and the server listens on `0.0.0.0`.

```bash
docker build -t goboblast .
docker run --rm -p 4317:4317 goboblast
```

To publish a different port, set `PORT` and map the same number:

```bash
docker run --rm -e PORT=8080 -p 8080:8080 goboblast
```

Compose builds the same image, maps port 4317, and restarts the container unless you stop it:

```bash
docker compose up --build
```

Open [http://localhost:4317](http://localhost:4317). `docker compose down` stops it.

### Serve under a path

`BASE_PATH` is a build argument. The image reads it while `next build` runs and passes it to Next.js as `basePath` and `assetPrefix`, so the page and its assets are both served under that prefix. Leave it unset to keep the app at `/`. `gobos` and `/gobos` both become `/gobos`. A trailing slash is rejected.

```bash
BASE_PATH=/gobos docker compose build
docker compose up -d
```

`docker compose build --build-arg BASE_PATH=/gobos` does the same thing. Open [http://localhost:4317/gobos](http://localhost:4317/gobos). The prefix is fixed in the image; change it by building again. Setting `BASE_PATH` only on `docker run` does not move the app.

## How to use it

- Click the black stage, or press a key that is not already assigned, to open the control panel.
- Esc closes the panel. F toggles browser fullscreen.
- The panel leads with Projection, then Source, then Look and Motion. On a wide screen those groups sit in columns so the panel does not need to scroll. Each group shows its current value and can reset itself.
- Source is Text or Image. Image takes a PNG, JPG, WebP, GIF (first frame), or SVG and keeps it in this browser. Luma key knocks out dark or light pixels. Chroma key knocks out a color; click the picture or use the screen eyedropper to choose it. Keyed pixels are transparent, so the black stage shows through. Tint recolors what remains.
- Drag Spin left of center for a counterclockwise spin and right of center for a clockwise spin. The middle is 0°/s, so the gobo holds its angle. The slider sets that speed directly, up to 180°/s.
- The projection diagram is a side view of the room: the floor and the wall meet at a corner. Drag the projector to any height and distance. Drag the spot or the angle slider to aim; they stay in step. 90° is straight down on the floor. A beam that is too shallow to reach the floor hits the wall instead. On the floor the angle is the floor keystone. On the wall, a horizontal beam is straight on and has no skew, and a beam that drops onto the wall is oblique to it.
- Left and right arrows add 15°/s on top of the slider and do not open the panel. Opposite presses slow the spin and can reverse it.
- Up and down arrows raise and lower the projector angle by 1°, or 5° with Shift, between 0° and 90°. They move the spot the same way the angle slider does, so a shallow beam lands on the wall, and they do not open the panel. Holding a key repeats.
- While a text field, menu, or slider in the panel is focused, those keys stay with the control.
- The panel hides after 4 seconds without a pointer move, key press, or control change. Any of those resets the timer.
- Settings are saved in this browser and restored on the next visit. The picture itself is stored with IndexedDB so a large file still survives a reload.
- Clear the gobo text for a pure black frame. With the panel hidden, the cursor is hidden too.

The panel uses the same dark slate controls as [Fotoblast](https://github.com/frd1963/fotoblast): translucent navy card, compact uppercase title, and slate inputs.
