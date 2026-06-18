type Letter = {
  el: HTMLSpanElement;
  x: number;
  vx: number;
  x0: number;
  y0: number;
  width: number;
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

const substeps = 8;
const damping = 0.01;
const delta = 20.0;
const base_k = 1.0;
const base_alpha = 0.2;
const base_beta = 0.2;

const init_pull_ratio = 3.0;
const init_pull_ms = 400;

function pullfunc(t: number): number {
  return Math.pow(t, 1.5);
}

export function rubberfyText(el: HTMLElement): void {
  const text = (el.textContent ?? "").trim();
  el.textContent = "";

  const n = Math.max(2, text.length);

  const scale = clamp((n - 1) / 6, 0.5, 4.0);

  const k = base_k * scale;
  const beta = base_beta * Math.sqrt(scale);
  const alpha = base_alpha * scale;

  const spans: HTMLSpanElement[] = [];

  for (const c of text) {
    const span = document.createElement("span");
    span.textContent = c;
    span.className = "rubbery-letter";
    span.style.position = "static";
    el.appendChild(span);
    spans.push(span);
  }

  const base = el.getBoundingClientRect();

  const letters: Letter[] = spans.map((span) => {
    const rect = span.getBoundingClientRect();
    const x = rect.left - base.left;
    const y = rect.top - base.top;
    return { el: span, x, vx: 0, x0: x, y0: y, width: rect.width };
  });

  if (letters.length === 0) return;

  const w_total = Math.max(...letters.map((p) => p.x0 + p.width));
  const h_total = Math.max(
    ...spans.map((span) => span.getBoundingClientRect().bottom - base.top),
  );

  el.style.width = `${w_total}px`;
  el.style.height = `${h_total}px`;

  for (const p of letters) {
    p.el.style.position = "absolute";
    p.el.style.left = "0";
    p.el.style.top = "0";
    p.el.style.transform = `translate(${p.x}px, ${p.y0}px)`;
  }

  let dragging = false;
  let drag_id = -1;
  let pointer_x = 0;
  let init_cancelled = false;

  const init_started_at = performance.now();
  const init_drag_id = letters.length - 1;
  const init_pull_distance = w_total * init_pull_ratio;

  function localX(e: PointerEvent): number {
    return e.clientX - el.getBoundingClientRect().left;
  }

  function nearestLetterIndex(x: number): number {
    let best = 0;
    let dmin = Infinity;
    for (let i = 0; i < letters.length; i++) {
      const cx = letters[i].x + letters[i].width * 0.5;
      const dist = Math.abs(x - cx);
      if (dist < dmin) {
        best = i;
        dmin = dist;
      }
    }
    return best;
  }

  function addPullForce(
    force: number[],
    letter_id: number,
    target_x: number,
  ): void {
    const p = letters[letter_id];
    const cx = p.x + p.width * 0.5;
    force[letter_id] += (target_x - cx) * alpha;
  }

  el.addEventListener("pointerdown", (e) => {
    init_cancelled = true;
    dragging = true;
    pointer_x = localX(e);
    drag_id = nearestLetterIndex(pointer_x);
    if (drag_id === 0) drag_id = -1;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    pointer_x = localX(e);
  });

  el.addEventListener("pointerup", (e) => {
    dragging = false;
    drag_id = -1;

    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
  });

  const localK = (k * text.length) / 6;

  function update(): void {
    const dt = 1 / substeps;
    const init_elapsed = performance.now() - init_started_at;
    const init_t = clamp(init_elapsed / init_pull_ms, 0, 1);
    const init_active =
      !init_cancelled && !dragging && init_elapsed < init_pull_ms;
    const init_target_x =
      letters[init_drag_id].x0 +
      letters[init_drag_id].width * 0.5 +
      init_pull_distance * pullfunc(init_t);

    for (let step = 0; step < substeps; step++) {
      const force = new Array<number>(letters.length).fill(0);
      for (let i = 0; i + 1 < letters.length; i++) {
        const s = letters[i];
        const t = letters[i + 1];
        const l0 = t.x0 - s.x0;
        const l = t.x - s.x;
        const f = localK * (l - l0) + beta * (t.vx - s.vx);
        force[i] += f;
        force[i + 1] -= f;
      }

      if (dragging && drag_id !== -1) {
        addPullForce(force, drag_id, pointer_x);
      } else if (init_active) {
        addPullForce(force, init_drag_id, init_target_x);
      }

      letters[0].x = letters[0].x0;
      letters[0].vx = 0;

      for (let i = 1; i < letters.length; i++) {
        const p = letters[i];
        p.vx += force[i] * dt;
        p.vx *= 1.0 - damping;
        p.x = p.x + p.vx * dt;
        if (p.x < p.x0 - delta) {
          p.x = p.x0 - delta;
          if (p.vx < 0) p.vx = 0;
        }
      }
    }
    for (const p of letters) {
      p.el.style.transform = `translate(${p.x}px, ${p.y0}px)`;
    }
    requestAnimationFrame(update);
  }
  update();
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll<HTMLElement>("[data-rubbery-text]")
    .forEach(rubberfyText);
});
