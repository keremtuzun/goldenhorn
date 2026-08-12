/* CV Scoreboard tracker and The BPS Model.
   The model page used to describe the maths and show nothing. Now it runs the
   real solver on a scenario whose true rates we know, so you can watch it
   recover them and see how close it gets. */

import { $, $$, esc, num, fmtClock, seeded, downloadFile, clamp } from '../util.js';
import { icon } from '../icons.js';
import { state } from '../store.js';
import { teamName } from '../api.js';
import { solveBPS, buildDesign, windowsFromFlags } from '../solver.js';
import { hydrate, toast, openModal, closeModal } from '../ui.js';
import { pageHead, statTile, emptyState } from './parts.js';

/* ─────────────────────────── CV scoreboard ─────────────────────────── */

let cvSpeed = 3;
let cvDeltas = [];
let cvRunning = false;

export function renderCV(root) {
  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Parallel tracking', title: 'CV Scoreboard Tracker',
      lede: 'Scouts should not be counting game pieces. A separate process reads the official scoreboard off the stream and logs every point change with its timestamp, then hands the stream of deltas to the solver.',
    })}

    <div class="notice" style="margin-bottom:var(--s4)">${icon('info')}<div>
      <b>This page simulates the reader, it does not run it</b>
      <p>The real pipeline is an OCR process outside the browser. What runs here produces a delta
      stream in the same shape, so you can see the output format and push it through the solver.
      Real logs can be pasted in below.</p>
    </div></div>

    <div class="g12" style="margin-bottom:var(--s4)">
      <div class="card c5">
        <div class="card-head"><div class="h-sec">1 · Source</div></div>
        <div class="field"><label for="cvSrc">Match video</label>
          <input id="cvSrc" value="twitch.tv/firstinspires · Marmara Q-48" /></div>
        <div class="switch-row"><span>Processing speed</span>
          <div class="seg" id="cvSpeed"><span class="seg-thumb"></span>
            ${[1, 3, 5].map(s => `<button data-sp="${s}" class="${s === cvSpeed ? 'on' : ''}">${s}x</button>`).join('')}
          </div>
        </div>
        <div class="switch-row"><span>Scoreboard region</span><span class="tag pos">${icon('check')}calibrated</span></div>
        <button class="btn pos full lg" id="cvRun" style="margin-top:var(--s4)">
          ${icon('play')}Process the match
        </button>
      </div>

      <div class="card c7">
        <div class="card-head"><div class="h-sec">2 · Live read</div></div>
        <div class="row" style="gap:var(--s3);margin-bottom:var(--s3);font-family:var(--mono);font-size:var(--t-xs)">
          <span id="cvClock" class="dim">0:00</span>
          <div class="meter" style="flex:1"><i id="cvBar" style="width:0"></i></div>
          <span id="cvSpeedLbl" class="dim">${cvSpeed}x</span>
        </div>
        <div class="term" id="cvTerm"><div class="ln m">// idle. Press process to start reading the scoreboard.</div></div>
      </div>
    </div>

    <div class="g12">
      <div class="card c7">
        <div class="card-head">
          <div><div class="h-sec">3 · Delta stream</div>
          <div class="card-note">Every score change with the second it happened, ready for the solver.</div></div>
          <div class="row" style="gap:var(--s2)">
            <button class="btn sm ghost" id="cvPaste">${icon('upload')}Paste real log</button>
            <button class="btn sm ghost" id="cvExport">${icon('download')}JSON</button>
          </div>
        </div>
        <div class="term" id="cvJson" style="max-height:15rem"><div class="ln m">// no deltas yet</div></div>
      </div>

      <div class="card c5">
        <div class="card-head"><div class="h-sec">4 · What this unlocks</div></div>
        <div class="bullets">
          <div class="bullet">${icon('check')}<span>Average scoring per match, per robot, not per alliance</span></div>
          <div class="bullet">${icon('check')}<span>Scoring efficiency as a match wears on</span></div>
          <div class="bullet">${icon('check')}<span>Opportunities lost under defensive pressure</span></div>
          <div class="bullet">${icon('check')}<span>A number for how much a defender actually cost the other side</span></div>
        </div>
        <hr class="rule tight" />
        <div class="steps">
          <div class="step"><span class="s-n">A</span><div><b>One operator runs the reader</b>
            <p>At triple speed, exporting the delta JSON per match.</p></div></div>
          <div class="step"><span class="s-n">B</span><div><b>Logs land in shared storage</b>
            <p>Organised by match key so imports are unambiguous.</p></div></div>
          <div class="step"><span class="s-n">C</span><div><b>Import and resolve</b>
            <p>Deltas meet the scouts' flags and the solver recomputes every rate.</p></div></div>
        </div>
      </div>
    </div>`;

  hydrate(root);
  const seg = $('#cvSpeed', root);
  const active = $('button.on', seg);
  if (active) {
    $('.seg-thumb', seg).style.width = `${active.offsetWidth}px`;
    $('.seg-thumb', seg).style.transform = `translateX(${active.offsetLeft - 3}px)`;
  }
}

export function bindCV(root) {
  root.addEventListener('click', e => {
    const sp = e.target.closest('#cvSpeed button');
    if (sp) {
      cvSpeed = Number(sp.dataset.sp);
      $$('#cvSpeed button', root).forEach(b => b.classList.toggle('on', b === sp));
      const seg = $('#cvSpeed', root);
      $('.seg-thumb', seg).style.width = `${sp.offsetWidth}px`;
      $('.seg-thumb', seg).style.transform = `translateX(${sp.offsetLeft - 3}px)`;
      $('#cvSpeedLbl', root).textContent = `${cvSpeed}x`;
      return;
    }
    if (e.target.closest('#cvRun')) { runCV(root); return; }
    if (e.target.closest('#cvExport')) {
      if (!cvDeltas.length) { toast('Process a match first, there is nothing to export.', 'warn'); return; }
      downloadFile('cv-deltas.json', JSON.stringify({ source: $('#cvSrc', root).value, deltas: cvDeltas }, null, 2), 'application/json');
      toast('Delta stream exported.', 'pos');
      return;
    }
    if (e.target.closest('#cvPaste')) {
      openModal(`
        <h3 class="h-sec">Paste a real delta log</h3>
        <p class="prose" style="margin:var(--s3) 0">JSON in the shape
        <span class="mono">{"deltas":[{"t":12,"alliance":"red","pts":4}]}</span>, or a bare array.</p>
        <textarea id="cvIn" rows="8" placeholder='{"deltas":[…]}' data-autofocus></textarea>
        <div class="row end" style="gap:var(--s2);margin-top:var(--s4)">
          <button class="btn ghost" data-close>Cancel</button>
          <button class="btn" data-import>Import</button>
        </div>`, {
        onMount(panel) {
          panel.addEventListener('click', ev => {
            if (ev.target.closest('[data-close]')) return closeModal();
            if (!ev.target.closest('[data-import]')) return;
            try {
              const parsed = JSON.parse($('#cvIn', panel).value);
              const list = Array.isArray(parsed) ? parsed : parsed.deltas;
              if (!Array.isArray(list)) throw new Error('No deltas array found.');
              cvDeltas = list.map(d => ({ t: Number(d.t), alliance: d.alliance || 'red', pts: Number(d.pts ?? d.delta ?? 0) }));
              closeModal();
              paintDeltas(root);
              toast(`Imported ${cvDeltas.length} deltas.`, 'pos');
            } catch (err) {
              toast(`Could not read that: ${err.message}`, 'neg');
            }
          });
        },
      });
    }
  });
}

function paintDeltas(root) {
  const json = $('#cvJson', root);
  json.innerHTML = '<div class="ln m">[</div>' + cvDeltas.map(d =>
    `<div class="ln"><span class="m">  {</span>"t":<span class="y">${d.t}</span>,"alliance":<span class="g">"${esc(d.alliance)}"</span>,"pts":<span class="y">${d.pts}</span><span class="m">},</span></div>`
  ).join('') + '<div class="ln m">]</div>';
}

function runCV(root) {
  if (cvRunning) return;
  cvRunning = true;
  const term = $('#cvTerm', root), json = $('#cvJson', root);
  const bar = $('#cvBar', root), clock = $('#cvClock', root);
  const btn = $('#cvRun', root);
  btn.disabled = true;
  cvDeltas = [];
  term.innerHTML = '';
  json.innerHTML = '<div class="ln m">[</div>';

  const rnd = seeded(Date.now() % 100000);
  const boot = [
    ['m', `[init] opening stream · ${$('#cvSrc', root).value}`],
    ['b', '[roi] scoreboard region locked, OCR warm'],
    ['y', `[run] reading at ${cvSpeed}x`],
  ];
  let i = 0;
  const bootTimer = setInterval(() => {
    if (i < boot.length) {
      term.insertAdjacentHTML('beforeend', `<div class="ln ${boot[i][0]}">${esc(boot[i][1])}</div>`);
      term.scrollTop = term.scrollHeight;
      i++;
      return;
    }
    clearInterval(bootTimer);
    let sec = 0, red = 0, blue = 0;
    const run = setInterval(() => {
      sec++;
      bar.style.width = `${(sec / 150) * 100}%`;
      clock.textContent = fmtClock(sec);
      if (rnd() < 0.32) {
        const alliance = rnd() < 0.5 ? 'red' : 'blue';
        const pts = [2, 3, 4, 5][Math.floor(rnd() * 4)];
        if (alliance === 'red') red += pts; else blue += pts;
        cvDeltas.push({ t: sec, alliance, pts });
        term.insertAdjacentHTML('beforeend',
          `<div class="ln ${alliance === 'red' ? 'r' : 'b'}">[${fmtClock(sec)}] ${alliance.toUpperCase()} +${pts}  (R ${red} / B ${blue})</div>`);
        json.insertAdjacentHTML('beforeend',
          `<div class="ln"><span class="m">  {</span>"t":<span class="y">${sec}</span>,"alliance":<span class="g">"${alliance}"</span>,"pts":<span class="y">${pts}</span><span class="m">},</span></div>`);
        term.scrollTop = term.scrollHeight;
        json.scrollTop = json.scrollHeight;
      }
      if (sec >= 150) {
        clearInterval(run);
        term.insertAdjacentHTML('beforeend',
          `<div class="ln g">[done] ${cvDeltas.length} deltas · final ${red} to ${blue}</div>`);
        json.insertAdjacentHTML('beforeend', '<div class="ln m">]</div>');
        btn.disabled = false;
        cvRunning = false;
        toast(`Read complete. ${cvDeltas.length} deltas at ${cvSpeed}x.`, 'pos');
      }
    }, Math.max(14, 90 / cvSpeed));
  }, 240);
}

export const cvDeltaStream = () => cvDeltas;

/* ─────────────────────────── the BPS model ─────────────────────────── */

/** A synthetic match with rates we chose, so the solve can be graded.
 *  Six robots, each with a true points-per-second rate, flagged as scoring
 *  across overlapping spans. The score stream is generated from those rates
 *  plus noise, exactly the way the real CV reader would report it. */
function syntheticMatch({ noise = 0.12, seed = 8159 } = {}) {
  const rnd = seeded(seed);
  const teams = state.teams.slice(0, 6).map(t => t.team);
  while (teams.length < 6) teams.push(9000 + teams.length);

  const truth = teams.map(() => +(0.35 + rnd() * 1.5).toFixed(2));
  const spans = [];
  teams.forEach((team, i) => {
    let t = Math.floor(rnd() * 20);
    while (t < 145) {
      const len = 8 + Math.floor(rnd() * 26);
      const end = Math.min(150, t + len);
      if (rnd() < 0.72) spans.push({ team, start: t, end });
      t = end + Math.floor(rnd() * 12);
    }
  });

  // Score deltas: each second, every actively flagged robot contributes its
  // rate, and the reader sees the alliance total rounded into point chunks.
  const deltas = [];
  let carry = 0;
  for (let s = 1; s <= 150; s++) {
    const active = spans.filter(sp => sp.start < s && sp.end >= s);
    const rate = active.reduce((acc, sp) => acc + truth[teams.indexOf(sp.team)], 0);
    carry += rate * (1 + (rnd() - 0.5) * 2 * noise);
    if (carry >= 2) {
      const pts = Math.floor(carry);
      deltas.push({ t: s, alliance: 'red', pts });
      carry -= pts;
    }
  }
  return { teams, truth, spans, deltas };
}

let bpsRun = null;

export function renderBPS(root) {
  root.innerHTML = `
    ${pageHead({
      eyebrow: 'The maths behind the number', title: 'The BPS Model',
      lede: 'OPR writes one equation per match and treats two and a half minutes as a single lump. We cut each match into windows and get dozens of equations instead, which is a far more honest place to attribute points from.',
    })}

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="h-sec">${icon('sigma')}Windowed equations</div></div>
      <p class="prose">A window opens whenever the set of robots flagged as actively scoring changes.
      Each window <span class="mono">w</span> gives one linear equation:</p>
      <div class="formula">Σ<sub>i ∈ A<span class="v">w</span></sub> BPS<sub>i</sub> · L<span class="v">w</span> ≈ S<span class="v">w</span></div>
      <div class="g12">
        <div class="c4 bullet">${icon('right')}<span><b class="mono">A<sub>w</sub></b> the robots flagged scoring in that window</span></div>
        <div class="c4 bullet">${icon('right')}<span><b class="mono">L<sub>w</sub></b> how long the window lasted, in seconds</span></div>
        <div class="c4 bullet">${icon('right')}<span><b class="mono">S<sub>w</sub></b> the points that actually landed, from the reader</span></div>
      </div>
      <div class="bullet" style="margin-top:var(--s3)">${icon('target')}<span><b class="mono">BPS<sub>i</sub></b> each robot's points per second. This is the unknown we solve for.</span></div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="h-sec">${icon('cpu')}How it is solved</div></div>
      <p class="prose">Robots cannot score negative points and they have mechanical ceilings, so this is a
      bounded, regularised least squares problem rather than a plain one:</p>
      <div class="formula">β = argmin ‖W<sup>½</sup>(Xβ − Y)‖² + λ‖β‖²&nbsp;&nbsp;subject to&nbsp;&nbsp;0 ≤ β<span class="v">j</span> ≤ cap<span class="v">j</span></div>
      <div class="g12">
        <div class="c4 step"><span class="s-n">W</span><div><b>Weights</b>
          <p>A long window with one scorer attributes cleanly. A short one with three barely constrains anything, so it counts for less.</p></div></div>
        <div class="c4 step"><span class="s-n">λ</span><div><b>Ridge penalty</b>
          <p>Alliance matrices go near singular when the same three robots always play together. The penalty keeps the solve stable.</p></div></div>
        <div class="c4 step"><span class="s-n">≤</span><div><b>Box constraint</b>
          <p>Each coordinate is clamped as it updates, so the answer obeys physics exactly rather than being fixed up afterwards.</p></div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div><div class="h-sec">${icon('activity')}Watch it solve</div>
        <div class="card-note">A synthetic match with rates we chose, so the answer can be marked. The solver never sees the true rates.</div></div>
        <div class="row" style="gap:var(--s2)">
          <button class="btn ghost sm" id="bpsNew">${icon('dice')}New match</button>
          <button class="btn sm" id="bpsSolve">${icon('play')}Solve</button>
        </div>
      </div>

      <div class="g12" style="margin-bottom:var(--s4)">
        <div class="c6 field"><label for="bpsLambda">Ridge penalty λ <span class="opt">higher is more cautious</span></label>
          <div class="row" style="gap:var(--s3)">
            <input id="bpsLambda" type="range" min="0" max="300" value="35" style="flex:1" />
            <output class="mono accent" id="bpsLambdaOut">0.35</output>
          </div></div>
        <div class="c6 field"><label for="bpsNoise">Reader noise <span class="opt">how ragged the score stream is</span></label>
          <div class="row" style="gap:var(--s3)">
            <input id="bpsNoise" type="range" min="0" max="60" value="12" style="flex:1" />
            <output class="mono accent" id="bpsNoiseOut">12%</output>
          </div></div>
      </div>

      <div id="bpsOut">${emptyState({
        icon: 'sigma', title: 'Nothing solved yet',
        body: 'Generate a match, then solve it. You will see how many windows it produced, how fast the residual falls, and how close each recovered rate is to the truth.',
      })}</div>
    </div>

    <div class="card">
      <div class="card-head"><div class="h-sec">${icon('compare')}Why not just use OPR or EPA</div></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Aspect</th><th style="color:var(--gold-300)">Our BPS</th><th>OPR</th><th>EPA</th></tr></thead>
        <tbody>
          <tr><td><b>Granularity</b></td><td>Per-window, seconds long</td><td>One row per match</td><td>Possession based</td></tr>
          <tr><td><b>Solver</b></td><td>Bounded weighted ridge</td><td>Plain least squares</td><td>Trained model</td></tr>
          <tr><td><b>Input</b></td><td>Scout flags plus score deltas</td><td>Final scores only</td><td>Final scores only</td></tr>
          <tr><td><b>Fails when</b></td><td>Scouts mis-flag who was scoring</td><td>Partners always play together</td><td>The season is unusual</td></tr>
        </tbody>
      </table></div>
      <hr class="rule tight" />
      <p class="prose">The honest summary: same linear algebra roots as the classic FRC metrics, but forced
      to obey live scouting telemetry and real mechanical limits. It is better than OPR when the flags are
      good and worse when they are not, which is why the scout leaderboard matters.</p>
    </div>`;

  hydrate(root);
}

export function bindBPS(root) {
  const sync = () => {
    const l = Number($('#bpsLambda', root).value) / 100;
    const n = Number($('#bpsNoise', root).value);
    $('#bpsLambdaOut', root).textContent = l.toFixed(2);
    $('#bpsNoiseOut', root).textContent = `${n}%`;
    return { lambda: l, noise: n / 100 };
  };

  root.addEventListener('input', e => {
    if (e.target.closest('#bpsLambda, #bpsNoise')) sync();
  });

  root.addEventListener('click', e => {
    if (e.target.closest('#bpsNew')) {
      const { noise } = sync();
      bpsRun = syntheticMatch({ noise, seed: Math.floor(Math.random() * 99999) });
      $('#bpsOut', root).innerHTML = `<div class="notice">${icon('check')}<div>
        <b>Match generated</b><p>${bpsRun.spans.length} scoring spans across ${bpsRun.teams.length} robots,
        ${bpsRun.deltas.length} score deltas. Press solve.</p></div></div>`;
      hydrate($('#bpsOut', root), { animate: false });
      return;
    }
    if (e.target.closest('#bpsSolve')) solveDemo(root, sync());
  });
}

function solveDemo(root, { lambda, noise }) {
  if (!bpsRun) bpsRun = syntheticMatch({ noise });
  const { teams, truth, spans, deltas } = bpsRun;

  const windows = windowsFromFlags(spans, deltas.map(d => ({ t: d.t, pts: d.pts })));
  const design = buildDesign(windows, teams);
  const result = solveBPS(design, { lambda, caps: teams.map(() => 3.5), sweeps: 80 });

  const errs = result.beta.map((b, i) => Math.abs(b - truth[i]));
  const meanErr = errs.reduce((a, b) => a + b, 0) / errs.length;
  const maxRss = Math.max(...result.history.map(h => h.rss)) || 1;

  $('#bpsOut', root).innerHTML = `
    <div class="stats" style="margin-bottom:var(--s4)">
      ${statTile({ label: 'Windows produced', value: windows.length, icon: 'layers',
        sub: '<span class="dim">one equation each</span>' })}
      ${statTile({ label: 'Sweeps run', value: result.sweeps, icon: 'refresh',
        sub: `<span class="dim">${result.sweeps >= 80 ? 'hit the cap' : 'settled early'}</span>` })}
      ${statTile({ label: 'Variance explained', value: result.r2 != null ? result.r2 * 100 : '–',
        decimals: 1, suffix: '%', icon: 'activity' })}
      ${statTile({ label: 'Average error', value: meanErr, decimals: 3, icon: 'target',
        sub: '<span class="dim">points per second off the truth</span>' })}
    </div>

    <div class="g12">
      <div class="c7 card quiet" style="padding:0">
        <div class="h-sub" style="margin-bottom:var(--s3)">Recovered against the truth</div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Robot</th><th class="n">True rate</th><th class="n">Solved</th><th class="n">Off by</th><th></th></tr></thead>
          <tbody>${teams.map((t, i) => {
            const err = errs[i];
            const tone = err < 0.1 ? 'pos' : err < 0.25 ? 'warn' : 'neg';
            return `<tr>
              <td><div class="team-cell"><b>${t}</b><span class="tn">${esc(teamName(t))}</span></div></td>
              <td class="n dim">${num(truth[i], 2)}</td>
              <td class="n" style="color:var(--gold-300);font-weight:700">${num(result.beta[i], 2)}</td>
              <td class="n"><span class="tag ${tone}">${num(err, 2)}</span></td>
              <td style="width:6rem"><div class="meter"><i class="${tone}"
                data-w="${clamp((result.beta[i] / Math.max(...truth, ...result.beta)) * 100, 3, 100)}%"></i></div></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>

      <div class="c5 card quiet" style="padding:0">
        <div class="h-sub" style="margin-bottom:var(--s3)">Residual per sweep</div>
        <div class="hist" style="height:7rem">
          ${result.history.map(h => `<i data-h="${Math.max(1, (h.rss / maxRss) * 100).toFixed(1)}%"></i>`).join('')}
        </div>
        <p class="card-note" style="margin-top:var(--s3)">Each bar is one pass over every coordinate. The
        weighted sum of squared residuals falls fast and then flattens, which is where it stops.</p>
        <hr class="rule tight" />
        <p class="card-note">λ is ${num(lambda, 2)}. Push it up and the rates get pulled toward zero and
        toward each other, which is what you want when robots always play together and the maths cannot
        tell them apart.</p>
      </div>
    </div>`;

  hydrate($('#bpsOut', root));
}
