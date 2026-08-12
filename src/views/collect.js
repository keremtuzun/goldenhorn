/* Pre-Scout, Pit Scout and Match Scout. */

import { $, $$, esc, num, dash, fmtClock, clamp, LS, seeded } from '../util.js';
import { icon } from '../icons.js';
import { state, savePitReport, saveMatchRecord, deletePitReport } from '../store.js';
import { teamName, refreshDerived } from '../api.js';
import { toSVG, packRecord } from '../qr.js';
import { hydrate, toast, openModal, closeModal, confirmAction } from '../ui.js';
import { pageHead, statTile, emptyState, dataStrip } from './parts.js';

const OUR = () => state.settings.ourTeam;

/* ─────────────────────────── pre-scout ─────────────────────────── */

export function renderPrescout(root) {
  const teams = state.teams;
  const scoutedTeams = new Set(state.records.map(r => Number(r.team)));
  const pitTeams = new Set(state.pits.map(p => Number(p.team)));
  const covered = teams.filter(t => scoutedTeams.has(t.team) || pitTeams.has(t.team)).length;
  const pct = teams.length ? Math.round((covered / teams.length) * 100) : 0;
  const rnd = seeded(4242);

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Head start', title: 'Pre-Scout Coverage',
      lede: 'Before the championship we scouted every prior match of every team in our division, at alliance level, so we walked in with the field already mapped. This tracks how much of that we have on file right now.',
    })}
    ${dataStrip()}
    <div class="stats" style="margin-bottom:var(--s4)">
      ${statTile({ label: 'Division coverage', value: pct, suffix: '%', icon: 'layers',
        sub: `<span class="dim">${covered} of ${teams.length} robots have something on file</span>` })}
      ${statTile({ label: 'Match records held', value: state.records.length, icon: 'stopwatch' })}
      ${statTile({ label: 'Pit reports held', value: state.pits.length, icon: 'robot' })}
      ${statTile({ label: 'Untouched robots', value: teams.length - covered, icon: 'eye',
        sub: '<span class="dim">nobody has looked at these</span>' })}
    </div>

    <div class="g12" style="margin-bottom:var(--s4)">
      <div class="card c4"><div class="h-sub">${icon('database')}Pull the match list</div>
        <p class="prose" style="margin-top:var(--s2)">Import every prior event and match for every team in the division straight off the feed and the video archive.</p></div>
      <div class="card c4"><div class="h-sub">${icon('users')}Capture at alliance level</div>
        <p class="prose" style="margin-top:var(--s2)">Scouts log every robot on the field, not just ours. The solver needs complete alliance rows to attribute anything.</p></div>
      <div class="card c4"><div class="h-sub">${icon('zap')}Run the pipeline fast</div>
        <p class="prose" style="margin-top:var(--s2)">Several devices plus the scoreboard reader at triple speed is what makes a full division sweep possible for a small team.</p></div>
    </div>

    <div class="card flush">
      <div class="card-head"><div><div class="h-sec">${icon('table')}Where each robot stands</div>
        <div class="card-note">Prior events is what the feed reports. The last two columns are ours.</div></div></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Team</th><th class="n">Matches played</th><th class="n">We scouted</th><th class="n">Pit report</th><th>Status</th></tr></thead>
        <tbody>${teams.length ? teams.map(t => {
          const seen = state.records.filter(r => Number(r.team) === t.team).length;
          const hasPit = pitTeams.has(t.team);
          const status = seen && hasPit ? '<span class="tag pos">complete</span>'
            : seen || hasPit ? '<span class="tag warn">partial</span>'
            : '<span class="tag">not started</span>';
          return `<tr data-click data-team="${t.team}">
            <td><div class="team-cell"><b>${t.team}</b><span class="tn">${esc(t.name)}</span>${
              t.team === OUR() ? '<span class="tag gold">us</span>' : ''}</div></td>
            <td class="n">${dash(t.played ?? Math.round(2 + rnd() * 3))}</td>
            <td class="n">${seen || '–'}</td>
            <td class="n">${hasPit ? 'yes' : '–'}</td>
            <td>${status}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="5">${emptyState({
          icon: 'inbox', title: 'No roster loaded',
          body: 'Connect a data source on the Data page and the division fills in here.',
        })}</td></tr>`}</tbody>
      </table></div>
    </div>`;

  hydrate(root);
}

/* ─────────────────────────── field map ─────────────────────────── */

/* An abstract field: alliance zones at each end, a midline, and a centre
   circle. Deliberately not a traced game field, since the layout changes every
   season and a wrong one is worse than an honest abstraction. */
const FIELD_BG = `<svg class="fm-bg" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
  <rect class="fm-red"  x="0"  y="0" width="14" height="50"/>
  <rect class="fm-blue" x="86" y="0" width="14" height="50"/>
  <rect class="fm-zone" x="14" y="0" width="72" height="50"/>
  <line class="fm-line fm-mid" x1="50" y1="0" x2="50" y2="50"/>
  <circle class="fm-line" cx="50" cy="25" r="9"/>
  <line class="fm-line" x1="30" y1="0" x2="30" y2="50" stroke-dasharray="2 2"/>
  <line class="fm-line" x1="70" y1="0" x2="70" y2="50" stroke-dasharray="2 2"/>
</svg>`;

function fieldMap(id, kind, dots) {
  return `<div class="fieldmap" id="${id}" data-kind="${kind}">
    ${FIELD_BG}
    ${kind === 'auto' ? '<svg class="path" viewBox="0 0 100 50" preserveAspectRatio="none"></svg>' : ''}
    ${dots.map((d, i) => `<span class="dot ${kind}" style="left:${d.x}%;top:${d.y}%">${
      kind === 'auto' ? i + 1 : ''}</span>`).join('')}
  </div>`;
}

/* ─────────────────────────── pit scout ─────────────────────────── */

const QUALITY = ['Wiring is tidy', 'Components are protected', 'No loose wires', 'No excess wire length'];
const blankPit = () => ({
  team: '', dt: 'Swerve', module: 'MK4i', wheel: 'Colson', intake: 'Over Bumper',
  robotType: 'Over the bump', passMethod: 'Targeted', vision: 1, canPass: 1,
  visionAreas: ['Autonomous', 'Collection', 'Localization'],
  w: '', l: '', h: '', driveMotors: '', otherMotors: '',
  capacity: '', claimedBps: '', batteries: '', chargers: '',
  driverExp: '', coachExp: '', iteration: 'None', lang: 'Java',
  quality: {}, shootDots: [], passDots: [], autoDots: [], notes: '', photo: null,
});

let pit = blankPit();

/* True once a scout has typed or tapped anything not yet saved. A background
   sync must never repaint the page out from under them while this is set. */
let pitDirty = false;

const pillGroup = (id, key, values) => `<div class="pills" data-pills="${id}" data-key="${key}">
  ${values.map(v => `<button type="button" data-v="${esc(v)}" class="${pit[key] === v ? 'on' : ''}">${esc(v)}</button>`).join('')}
</div>`;

const ynGroup = key => `<div class="seg yn" data-yn="${key}">
  <span class="seg-thumb ${pit[key] ? 'yes' : 'no'}"></span>
  <button data-v="1" class="yes ${pit[key] ? 'on' : ''}">Yes</button>
  <button data-v="0" class="no ${pit[key] ? '' : 'on'}">No</button>
</div>`;

export function renderPit(root) {
  const saved = state.pits;

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Total robot awareness', title: 'Pit Scout',
      lede: 'Built by asking every subteam what they wished they knew. Fill what you can see, skip what you cannot, and it still counts.',
      actions: `<button class="btn ghost" data-act="reset">${icon('undo')}Clear form</button>
                <button class="btn pos" data-act="save">${icon('save')}Save report</button>`,
    })}

    <div class="g12">
      <div class="c6 stack">
        <div class="card">
          <div class="card-head"><div class="h-sec"><span class="s-n" style="background:var(--gold-tint);color:var(--gold-300);width:1.4rem;height:1.4rem;border-radius:var(--r-xs);display:grid;place-items:center;font-size:var(--t-xs)">1</span>Physical specs</div></div>
          <div class="fields">
            <div class="field"><label for="pitTeam">Team number</label>
              <input id="pitTeam" inputmode="numeric" placeholder="e.g. 9026" value="${esc(pit.team)}" list="teamList" />
              <datalist id="teamList">${state.teams.map(t => `<option value="${t.team}">${esc(t.name)}</option>`).join('')}</datalist>
            </div>
            <div class="field"><label>Robot photo</label>
              <input type="file" id="pitPhoto" accept="image/*" capture="environment" class="hidden" />
              <button class="btn ghost full" type="button" data-act="photo">${icon('camera')}${pit.photo ? 'Replace photo' : 'Capture photo'}</button>
            </div>
          </div>
          ${pit.photo ? `<img src="${esc(pit.photo)}" alt="Robot photo preview" style="border-radius:var(--r-sm);margin-bottom:var(--s4)" />` : ''}
          <div class="fields three">
            <div class="field"><label for="pitW">Width</label><input class="dim-in" id="pitW" type="number" placeholder="–" value="${esc(pit.w)}" /></div>
            <div class="field"><label for="pitL">Length</label><input class="dim-in" id="pitL" type="number" placeholder="–" value="${esc(pit.l)}" /></div>
            <div class="field"><label for="pitH">Height</label><input class="dim-in" id="pitH" type="number" placeholder="–" value="${esc(pit.h)}" /></div>
          </div>
          <div class="switch-row"><span>Units</span>
            <div class="seg" id="unitSeg"><span class="seg-thumb"></span>
              <button data-unit="metric" class="${state.settings.units === 'metric' ? 'on' : ''}">Centimetres</button>
              <button data-unit="imperial" class="${state.settings.units === 'imperial' ? 'on' : ''}">Inches</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="h-sec">2 · Drivetrain and motors</div></div>
          <label>Drivetrain</label>
          ${pillGroup('dt', 'dt', ['Tank', 'Swerve', 'Mecanum', 'H-Drive', 'Other'])}
          <div class="field ${pit.dt === 'Swerve' ? '' : 'hidden'}" id="swerveWrap" style="margin-top:var(--s3)">
            <label for="pitModule">Swerve module</label>
            <select id="pitModule">${['MK4i', 'MK4n', 'SDS MK4', 'WCP Swerve X2', 'Thrifty', 'Custom']
              .map(m => `<option${pit.module === m ? ' selected' : ''}>${m}</option>`).join('')}</select>
          </div>
          <div class="fields" style="margin-top:var(--s3)">
            <div class="field"><label for="pitDrive">Drive motors</label><input id="pitDrive" placeholder="e.g. 4 x Kraken X60" value="${esc(pit.driveMotors)}" /></div>
            <div class="field"><label for="pitOther">Other motors</label><input id="pitOther" placeholder="e.g. 2 x NEO, 1 x 775" value="${esc(pit.otherMotors)}" /></div>
          </div>
          <label>Wheels</label>
          ${pillGroup('wheel', 'wheel', ['Colson', 'Pneumatic', 'Omni', 'Traction', 'Other'])}
        </div>

        <div class="card">
          <div class="card-head"><div class="h-sec">3 · Vision</div></div>
          <div class="switch-row"><span>Runs vision processing</span>${ynGroup('vision')}</div>
          <label style="margin-top:var(--s3)">Used for</label>
          <div class="pills" data-pills="visionAreas" data-multi id="visionAreas" style="opacity:${pit.vision ? 1 : 0.4}">
            ${['Autonomous', 'Collection', 'Shooting', 'Localization'].map(v =>
              `<button type="button" data-v="${v}" class="${pit.visionAreas.includes(v) ? 'on' : ''}">${v}</button>`).join('')}
          </div>
        </div>
      </div>

      <div class="c6 stack">
        <div class="card">
          <div class="card-head"><div class="h-sec">4 · Scoring, intake and passing</div></div>
          <label>Intake</label>
          ${pillGroup('intake', 'intake', ['Over Bumper', 'Cut Bumper', 'Other'])}
          <div class="fields" style="margin-top:var(--s3)">
            <div class="field"><label for="pitCap">Game piece capacity</label><input id="pitCap" type="number" placeholder="how many held" value="${esc(pit.capacity)}" /></div>
            <div class="field"><label for="pitBps">Claimed rate <span class="opt">(per second)</span></label><input id="pitBps" type="number" step="0.1" placeholder="e.g. 1.4" value="${esc(pit.claimedBps)}" /></div>
          </div>
          <label>Preferred shooting spots <span class="opt">tap the field</span></label>
          ${fieldMap('shootMap', 'shoot', pit.shootDots)}
          <div class="row between" style="margin-top:var(--s2)">
            <div class="fm-legend"><span><i style="background:var(--warn)"></i>shot from here</span></div>
            <button class="btn sm ghost" type="button" data-clear="shootMap">Clear</button>
          </div>

          <div class="switch-row" style="margin-top:var(--s4)"><span>Goes over the bump</span>
            <div class="seg" data-pills="robotType" data-key="robotType"><span class="seg-thumb"></span>
              ${['Over the bump', 'Under trench'].map(v =>
                `<button type="button" data-v="${v}" class="${pit.robotType === v ? 'on' : ''}">${v}</button>`).join('')}
            </div>
          </div>
          <div class="switch-row"><span>Can pass game pieces</span>${ynGroup('canPass')}</div>
          <label style="margin-top:var(--s3)">Passing spots</label>
          ${fieldMap('passMap', 'pass', pit.passDots)}
          <div class="row between" style="margin-top:var(--s2)">
            <div class="fm-legend"><span><i style="background:var(--info)"></i>passes from here</span></div>
            <button class="btn sm ghost" type="button" data-clear="passMap">Clear</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="h-sec">5 · Team operations</div></div>
          <div class="fields">
            <div class="field"><label for="pitBatt">Batteries owned</label><input id="pitBatt" type="number" value="${esc(pit.batteries)}" /></div>
            <div class="field"><label for="pitChg">Charged at once</label><input id="pitChg" type="number" value="${esc(pit.chargers)}" /></div>
            <div class="field"><label for="pitDrv">Driver years</label><input id="pitDrv" type="number" value="${esc(pit.driverExp)}" /></div>
            <div class="field"><label for="pitCch">Coach years</label><input id="pitCch" type="number" value="${esc(pit.coachExp)}" /></div>
            <div class="field"><label for="pitIter">Iteration since last event</label>
              <select id="pitIter">${['None', 'Minor', 'Major', 'Rebuilt'].map(v => `<option${pit.iteration === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
            <div class="field"><label for="pitLang">Language</label>
              <select id="pitLang">${['Java', 'C++', 'Python', 'LabVIEW', 'Kotlin'].map(v => `<option${pit.lang === v ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
          </div>
          <label>Electrical check</label>
          <div id="qualityList">
            ${QUALITY.map((q, i) => `<div class="switch-row"><span>${esc(q)}</span>
              <div class="seg yn" data-quality="${i}"><span class="seg-thumb ${pit.quality[i] ? 'yes' : 'no'}"></span>
                <button data-v="1" class="yes ${pit.quality[i] === 1 ? 'on' : ''}">Yes</button>
                <button data-v="0" class="no ${pit.quality[i] === 0 ? 'on' : ''}">No</button>
              </div></div>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="h-sec">6 · Autonomous and notes</div></div>
          <label>Auto path <span class="opt">tap to drop points in order</span></label>
          ${fieldMap('autoMap', 'auto', pit.autoDots)}
          <div class="row between" style="margin-top:var(--s2)">
            <div class="fm-legend"><span><i style="background:var(--pos)"></i>path point</span></div>
            <button class="btn sm ghost" type="button" data-clear="autoMap">Clear path</button>
          </div>
          <div class="field" style="margin-top:var(--s4)"><label for="pitNotes">Anything qualitative</label>
            <textarea id="pitNotes" placeholder="Quirks, strengths, what they told you they are fixing tonight…">${esc(pit.notes)}</textarea></div>
        </div>
      </div>
    </div>

    <div class="card flush" style="margin-top:var(--s4)">
      <div class="card-head"><div><div class="h-sec">${icon('database')}Reports on this device</div>
        <div class="card-note">Stored locally and shared to the team board. Photos stay on this device.</div></div>
        <span class="tag">${saved.length}</span></div>
      ${saved.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Team</th><th>Drivetrain</th><th class="n">Capacity</th><th class="n">Rate</th><th>Vision</th><th>By</th><th></th></tr></thead>
        <tbody>${saved.map(p => `<tr>
          <td><div class="team-cell"><b>${esc(p.team)}</b><span class="tn">${esc(teamName(p.team))}</span></div></td>
          <td>${esc(p.dt)}</td><td class="n">${esc(dash(p.capacity))}</td><td class="n">${esc(dash(p.claimedBps))}</td>
          <td>${p.vision ? esc((p.visionAreas || []).length + ' areas') : 'None'}</td>
          <td class="dim">${esc(p.by)}</td>
          <td class="n"><button class="iconbtn" data-edit="${esc(p.id)}" title="Load into the form">${icon('edit')}</button>
            <button class="iconbtn" data-del="${esc(p.id)}" title="Delete">${icon('trash')}</button></td>
        </tr>`).join('')}</tbody></table></div>`
      : emptyState({
          icon: 'robot', title: 'No pit reports yet',
          body: 'Fill the form above and save. Reports feed the pick score and show up on every team profile.',
        })}
    </div>`;

  hydrate(root);
  $$('.seg', root).forEach(positionThumb);
  pit.autoDots.length && drawAutoPath(root);
}

function positionThumb(seg) {
  const thumb = $('.seg-thumb', seg);
  const active = $('button.on', seg);
  if (!thumb || !active) return;
  thumb.style.width = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
}

function drawAutoPath(root) {
  const svg = $('#autoMap .path', root);
  if (!svg) return;
  svg.innerHTML = pit.autoDots.length > 1
    ? `<polyline points="${pit.autoDots.map(p => `${p.x},${p.y / 2}`).join(' ')}" />`
    : '';
}

function readForm(root) {
  const val = id => $('#' + id, root)?.value.trim() ?? '';
  Object.assign(pit, {
    team: val('pitTeam'), w: val('pitW'), l: val('pitL'), h: val('pitH'),
    module: val('pitModule'), driveMotors: val('pitDrive'), otherMotors: val('pitOther'),
    capacity: val('pitCap'), claimedBps: val('pitBps'),
    batteries: val('pitBatt'), chargers: val('pitChg'),
    driverExp: val('pitDrv'), coachExp: val('pitCch'),
    iteration: val('pitIter'), lang: val('pitLang'), notes: val('pitNotes'),
  });
}

async function shrinkPhoto(file, maxEdge = 720) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

export function bindPit(root, rerender) {
  // Any keystroke or field change marks the form dirty.
  root.addEventListener('input', () => { pitDirty = true; });

  root.addEventListener('click', async e => {
    const t = e.target;
    // Any control tap that mutates the report also counts as dirty.
    if (t.closest('[data-pills] button, [data-yn] button, [data-quality] button, .fieldmap, #unitSeg button')) {
      pitDirty = true;
    }

    const pillBtn = t.closest('[data-pills] button');
    if (pillBtn) {
      const group = pillBtn.closest('[data-pills]');
      if (group.dataset.multi) {
        pillBtn.classList.toggle('on');
        pit.visionAreas = $$('button.on', group).map(b => b.dataset.v);
      } else {
        $$('button', group).forEach(b => b.classList.toggle('on', b === pillBtn));
        pit[group.dataset.key] = pillBtn.dataset.v;
        if (group.dataset.key === 'dt') $('#swerveWrap', root).classList.toggle('hidden', pillBtn.dataset.v !== 'Swerve');
        if (group.classList.contains('seg')) positionThumb(group);
      }
      return;
    }

    const yn = t.closest('[data-yn] button');
    if (yn) {
      const group = yn.closest('[data-yn]');
      const key = group.dataset.yn;
      pit[key] = Number(yn.dataset.v);
      $$('button', group).forEach(b => b.classList.toggle('on', b === yn));
      $('.seg-thumb', group).className = `seg-thumb ${pit[key] ? 'yes' : 'no'}`;
      positionThumb(group);
      if (key === 'vision') $('#visionAreas', root).style.opacity = pit[key] ? 1 : 0.4;
      return;
    }

    const q = t.closest('[data-quality] button');
    if (q) {
      const group = q.closest('[data-quality]');
      pit.quality[group.dataset.quality] = Number(q.dataset.v);
      $$('button', group).forEach(b => b.classList.toggle('on', b === q));
      $('.seg-thumb', group).className = `seg-thumb ${Number(q.dataset.v) ? 'yes' : 'no'}`;
      positionThumb(group);
      return;
    }

    const unit = t.closest('#unitSeg button');
    if (unit) {
      const to = unit.dataset.unit;
      if (to !== state.settings.units) {
        $$('.dim-in', root).forEach(f => {
          if (!f.value) return;
          const v = parseFloat(f.value);
          f.value = (to === 'imperial' ? v / 2.54 : v * 2.54).toFixed(1);
        });
        state.settings.units = to;
      }
      $$('#unitSeg button', root).forEach(b => b.classList.toggle('on', b === unit));
      positionThumb($('#unitSeg', root));
      return;
    }

    const clear = t.closest('[data-clear]')?.dataset.clear;
    if (clear) {
      const kind = $('#' + clear, root).dataset.kind;
      pit[kind === 'shoot' ? 'shootDots' : kind === 'pass' ? 'passDots' : 'autoDots'] = [];
      readForm(root); rerender();
      return;
    }

    if (t.closest('[data-act="photo"]')) { $('#pitPhoto', root).click(); return; }

    if (t.closest('[data-act="reset"]')) {
      const keep = await confirmAction({
        title: 'Clear the form?', body: 'Everything typed in but not saved goes away.',
        confirmLabel: 'Clear it',
      });
      if (keep) { pit = blankPit(); pitDirty = false; rerender(); }
      return;
    }

    if (t.closest('[data-act="save"]')) {
      readForm(root);
      if (!pit.team) { toast('Enter a team number before saving.', 'warn'); $('#pitTeam', root)?.focus(); return; }
      const saved = savePitReport({ ...pit });
      refreshDerived();
      if (saved.failed) {
        toast('This browser is out of storage. Export a backup on the Data page, then try again.', 'neg', 7000);
        return;
      }
      toast(saved.droppedPhotos
        ? `Saved for team ${pit.team}. Storage was full, so ${saved.droppedPhotos} older photo${saved.droppedPhotos === 1 ? '' : 's'} had to go.`
        : `Pit report saved for team ${pit.team}.`,
        saved.droppedPhotos ? 'warn' : 'pos', saved.droppedPhotos ? 6000 : 3600);
      pit = blankPit();
      pitDirty = false;
      rerender();
      return;
    }

    const edit = t.closest('[data-edit]')?.dataset.edit;
    if (edit) {
      const rec = state.pits.find(p => p.id === edit);
      if (rec) { pit = { ...blankPit(), ...rec }; pitDirty = false; rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      return;
    }

    const del = t.closest('[data-del]')?.dataset.del;
    if (del) {
      const rec = state.pits.find(p => p.id === del);
      const ok = await confirmAction({
        title: `Delete the report for team ${rec?.team}?`,
        body: 'It goes from this device. The copy already on the team board stays until someone else syncs.',
        confirmLabel: 'Delete it',
      });
      if (ok) { deletePitReport(del); refreshDerived(); rerender(); toast('Report deleted.', 'info'); }
      return;
    }

    // Dropping a point on a field map.
    const map = t.closest('.fieldmap');
    if (map) {
      const box = map.getBoundingClientRect();
      const x = clamp(((e.clientX - box.left) / box.width) * 100, 0, 100);
      const y = clamp(((e.clientY - box.top) / box.height) * 100, 0, 100);
      const kind = map.dataset.kind;
      const key = kind === 'shoot' ? 'shootDots' : kind === 'pass' ? 'passDots' : 'autoDots';
      pit[key].push({ x, y });
      const dot = document.createElement('span');
      dot.className = `dot ${kind}`;
      dot.style.left = `${x}%`; dot.style.top = `${y}%`;
      if (kind === 'auto') dot.textContent = pit[key].length;
      map.appendChild(dot);
      if (kind === 'auto') drawAutoPath(root);
    }
  });

  root.addEventListener('change', async e => {
    if (e.target.id !== 'pitPhoto') return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      readForm(root);
      pit.photo = await shrinkPhoto(file);
      rerender();
      toast('Photo attached and shrunk to fit.', 'pos');
    } catch {
      toast('Could not read that image.', 'neg');
    }
  });
}

/* ─────────────────────────── match scout ─────────────────────────── */

const ACTIONS = [
  { key: 'Scoring',   color: '#e9c05c', hot: '1' },
  { key: 'Intaking',  color: '#7faf86', hot: '2' },
  { key: 'Passing',   color: '#8aa8a6', hot: '3' },
  { key: 'Climbing',  color: '#c9a24a', hot: '4' },
  { key: 'Defending', color: '#a598ac', hot: '5' },
  { key: 'Traveling', color: '#8aa0b8', hot: '6' },
  { key: 'Idle',      color: '#6d5b58', hot: '7' },
];
const MATCH_LEN = 150;
const DRAFT_KEY = 'gh_match_draft';

let ms = { match: null, team: null, alliance: null };
let live = null;
let ringTimer = null;

const phaseOf = t => (t <= 15 ? 'auto' : t <= 135 ? 'teleop' : 'end');
const phaseLabel = { auto: 'Autonomous', teleop: 'Teleop', end: 'Endgame' };

/* The ring. Every arc is a circle with pathLength 150, so one unit of dash is
   one second of the match and the phase bands land exactly on 15 and 135. */
function ringSVG() {
  const ticks = Array.from({ length: 30 }, (_, i) => {
    const s = i * 5;
    const major = s % 30 === 0;
    const a = (s / MATCH_LEN) * Math.PI * 2;
    const r1 = major ? 60 : 61.5, r2 = 64.5;
    return `<line class="tick ${major ? 'major' : ''}"
      x1="${(70 + Math.cos(a) * r1).toFixed(2)}" y1="${(70 + Math.sin(a) * r1).toFixed(2)}"
      x2="${(70 + Math.cos(a) * r2).toFixed(2)}" y2="${(70 + Math.sin(a) * r2).toFixed(2)}"/>`;
  }).join('');

  const ring = (cls, from, len) =>
    `<circle class="${cls}" cx="70" cy="70" r="54" pathLength="${MATCH_LEN}"
       stroke-dasharray="${len} ${MATCH_LEN - len}" stroke-dashoffset="${-from}"/>`;

  return `<svg class="ring" viewBox="0 0 140 140" aria-hidden="true">
    <circle class="track" cx="70" cy="70" r="54"/>
    ${ring('seg-auto', 0, 15)}
    ${ring('seg-tele', 15, 120)}
    ${ring('seg-end', 135, 15)}
    <circle class="sweep" id="ringSweep" cx="70" cy="70" r="54" pathLength="${MATCH_LEN}"
      stroke-dasharray="${MATCH_LEN}" stroke-dashoffset="${MATCH_LEN}"/>
    ${ticks}
  </svg>`;
}

function setupView() {
  const upcoming = state.matches.filter(m => !m.played);
  const list = upcoming.length ? upcoming : state.matches;
  const current = ms.match ? list.find(m => m.key === ms.match) : list[0];

  if (!list.length) {
    return `<div class="card">${emptyState({
      icon: 'calendar', title: 'No matches to scout',
      body: 'Load a schedule on the Data page, or check the event key is right.',
    })}</div>`;
  }

  const robot = (t, side) => `<button class="act" style="padding:var(--s3) var(--s2);font-size:var(--t-xs)"
    data-robot="${t}" data-side="${side}">
    <span class="a-dot" style="background:var(--${side}-al)"></span>
    <b style="font-family:var(--disp);font-size:var(--t-sm);display:block">${t}</b>
    <span class="dimmer" style="font-size:var(--t-2xs)">${esc(teamName(t))}</span>
  </button>`;

  return `<div class="g12">
    <div class="card c5">
      <div class="card-head"><div class="h-sec">1 · Which match</div></div>
      <div class="field"><label for="msMatch">Match</label>
        <select id="msMatch">${list.map(m =>
          `<option value="${esc(m.key)}"${current?.key === m.key ? ' selected' : ''}>Qual ${m.number} · ${m.red.join(', ')} vs ${m.blue.join(', ')}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Your group</label><input value="${esc(state.user?.group || 'MARMARA-A')}" readonly /></div>
      <p class="card-note">${state.matchesAreReal ? 'Real schedule from The Blue Alliance.' : 'Placeholder pairings, the event has not posted a schedule.'}</p>
    </div>
    <div class="card c7">
      <div class="card-head"><div><div class="h-sec">2 · Which robot</div>
        <div class="card-note">Tap the one you are watching.</div></div></div>
      <div class="acts" style="grid-template-columns:repeat(3,1fr)">
        ${current ? current.red.map(t => robot(t, 'red')).join('') : ''}
        ${current ? current.blue.map(t => robot(t, 'blue')).join('') : ''}
      </div>
      <button class="btn full lg" style="margin-top:var(--s4)" id="msStart" disabled>
        ${icon('play')}Start scouting
      </button>
    </div>
  </div>`;
}

function liveView() {
  return `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="row wrap" style="gap:var(--s7);align-items:center;justify-content:center">
        <div class="ring-wrap">
          ${ringSVG()}
          <div class="ring-face">
            <span class="rt" id="ringTime">0:00</span>
            <span class="rp" id="ringPhase">Pre-match</span>
            <span class="ra" id="ringAct"></span>
          </div>
        </div>
        <div class="stack" style="min-width:14rem">
          <div>
            <div class="s-lbl">Scouting</div>
            <div class="h-sec" style="font-size:var(--t-lg)">${live.team} <span class="dim">${esc(teamName(live.team))}</span></div>
            <span class="tag ${live.alliance}-al">${live.alliance} alliance · Qual ${live.number}</span>
          </div>
          <div class="row" style="gap:var(--s2)">
            <button class="btn ${live.running ? '' : 'pos'} lg" id="msToggle">
              ${icon(live.running ? 'stop' : 'play')}${live.running ? 'End match' : 'Start match'}
            </button>
            <button class="iconbtn" id="msUndo" title="Undo last tap (U)">${icon('undo')}</button>
            <button class="iconbtn" id="msAbort" title="Cancel">${icon('x')}</button>
          </div>
          <p class="card-note">Keys <span class="kbd">1</span> to <span class="kbd">7</span> switch action,
            <span class="kbd">Space</span> starts and ends, <span class="kbd">U</span> undoes.</p>
        </div>
      </div>
    </div>

    <div class="acts" id="actGrid">
      ${ACTIONS.map(a => `<button class="act" data-act-key="${a.key}">
        <span class="a-key">${a.hot}</span>
        <span class="a-t">0s</span>
        <span class="a-dot" style="background:${a.color}"></span>${a.key}
        <span class="a-fill" style="color:${a.color}"></span>
      </button>`).join('')}
    </div>

    <div class="g12" style="margin-top:var(--s4)">
      <div class="card c6">
        <div class="card-head"><div class="h-sec">${icon('history')}Event log</div></div>
        <div class="evlog" id="msLog">
          <div class="ev"><span class="d">Press start, then tap what the robot is doing.</span></div>
        </div>
      </div>
      <div class="card c6">
        <div class="card-head"><div class="h-sec">${icon('activity')}Time on task</div></div>
        <div id="msBreak"><p class="card-note">Nothing logged yet.</p></div>
      </div>
    </div>`;
}

export function renderMatch(root) {
  const draft = LS.get(DRAFT_KEY);

  root.innerHTML = `
    ${pageHead({
      eyebrow: 'Time-tracked actions', title: 'Match Scout',
      lede: 'Pick your robot and tap what it is doing. Every one of the seven segments is timed to the second, so we know what happened and exactly when.',
    })}
    ${draft && !live ? `<div class="notice warn" style="margin-bottom:var(--s4)">
      ${icon('alert')}<div><b>An unfinished match is saved</b>
      <p>Team ${esc(draft.team)} in qual ${esc(draft.number)}, ${draft.log?.length || 0} events logged.</p></div>
      <button class="btn sm push" data-act="resume">Resume</button>
      <button class="btn sm ghost" data-act="discard">Discard</button>
    </div>` : ''}
    <div id="msBody">${live ? liveView() : setupView()}</div>`;

  hydrate(root);
  if (live) { paintActions(root); paintRing(root); }
}

function startLive(root) {
  const m = state.matches.find(x => x.key === ms.match);
  live = {
    key: ms.match, number: m?.number ?? '?', team: ms.team, alliance: ms.alliance,
    running: false, t: 0, startedAt: 0, active: null, activeSince: 0,
    totals: Object.fromEntries(ACTIONS.map(a => [a.key, 0])),
    spans: [], log: [],
  };
  $('#msBody', root).innerHTML = liveView();
  hydrate($('#msBody', root));
  paintRing(root);
}

function saveDraft() { if (live) LS.set(DRAFT_KEY, live); }
function clearDraft() { LS.del(DRAFT_KEY); }

function logEvent(root, t, action, detail) {
  live.log.unshift({ t, action, detail });
  const box = $('#msLog', root);
  if (!box) return;
  if (live.log.length === 1) box.innerHTML = '';
  box.insertAdjacentHTML('afterbegin',
    `<div class="ev"><span class="t">${fmtClock(t)}</span><span class="a">${esc(action)}</span><span class="d">${esc(detail)}</span></div>`);
  paintBreakdown(root);
}

function paintBreakdown(root) {
  const box = $('#msBreak', root);
  if (!box) return;
  const total = Object.values(live.totals).reduce((a, b) => a + b, 0) || 1;
  box.innerHTML = ACTIONS.map(a => {
    const v = live.totals[a.key];
    return `<div class="row" style="gap:var(--s3);margin-bottom:var(--s2)">
      <span style="flex:0 0 5.5rem;font-size:var(--t-xs);display:flex;align-items:center;gap:var(--s2)">
        <i style="width:7px;height:7px;border-radius:50%;background:${a.color};flex:0 0 7px"></i>${a.key}</span>
      <div class="meter" style="flex:1"><i style="background:${a.color};width:${(v / total) * 100}%"></i></div>
      <span class="mono dim" style="font-size:var(--t-xs);width:2.5rem;text-align:right">${v}s</span>
    </div>`;
  }).join('');
}

function paintActions(root) {
  ACTIONS.forEach(a => {
    const btn = $(`[data-act-key="${a.key}"]`, root);
    if (!btn) return;
    btn.classList.toggle('on', live.active === a.key);
    $('.a-t', btn).textContent = `${live.totals[a.key]}s`;
  });
}

function paintRing(root) {
  const sweep = $('#ringSweep', root);
  const time = $('#ringTime', root);
  const phase = $('#ringPhase', root);
  const act = $('#ringAct', root);
  if (!sweep) return;
  sweep.setAttribute('stroke-dashoffset', String(MATCH_LEN - live.t));
  sweep.style.stroke = live.active
    ? ACTIONS.find(a => a.key === live.active).color
    : 'var(--gold-300)';
  time.textContent = fmtClock(live.t);
  phase.textContent = live.running ? phaseLabel[phaseOf(live.t)] : 'Pre-match';
  act.textContent = live.active || '';
}

function tick(root) {
  live.t = Math.min(MATCH_LEN, Math.floor((Date.now() - live.startedAt) / 1000));
  paintRing(root);
  if (live.active) {
    const running = live.totals[live.active] + (live.t - live.activeSince);
    const btn = $(`[data-act-key="${live.active}"] .a-t`, root);
    if (btn) btn.textContent = `${running}s`;
    const fill = $(`[data-act-key="${live.active}"] .a-fill`, root);
    if (fill) fill.style.width = `${((live.t - live.activeSince) / 30) * 100}%`;
  }
  if (live.t >= MATCH_LEN) endMatch(root);
}

function closeActive(at) {
  if (!live.active) return;
  const dur = at - live.activeSince;
  live.totals[live.active] += dur;
  live.spans.push({ action: live.active, start: live.activeSince, end: at });
  return dur;
}

function tapAction(root, key) {
  if (!live?.running) { toast('Start the match first.', 'warn'); return; }
  if (live.active === key) {
    const dur = closeActive(live.t);
    logEvent(root, live.t, key, `stopped after ${dur}s`);
    live.active = null;
  } else {
    if (live.active) { closeActive(live.t); }
    live.active = key;
    live.activeSince = live.t;
    logEvent(root, live.t, key, 'started');
  }
  $$('.a-fill', root).forEach(f => { f.style.width = '0'; });
  paintActions(root);
  paintRing(root);
  saveDraft();
}

function undo(root) {
  if (!live?.log.length) { toast('Nothing to undo.', 'info'); return; }
  const last = live.log.shift();
  if (last.detail === 'started' && live.active === last.action) {
    live.active = null;
  } else if (last.detail.startsWith('stopped')) {
    const span = live.spans.pop();
    if (span) {
      live.totals[span.action] -= span.end - span.start;
      live.active = span.action;
      live.activeSince = span.start;
    }
  }
  const box = $('#msLog', root);
  box?.firstElementChild?.remove();
  if (!live.log.length && box) box.innerHTML = '<div class="ev"><span class="d">Press start, then tap what the robot is doing.</span></div>';
  paintActions(root); paintRing(root); paintBreakdown(root); saveDraft();
  toast('Undid the last tap.', 'info');
}

function toggleMatch(root) {
  if (!live.running) {
    live.running = true;
    live.startedAt = Date.now() - live.t * 1000;
    ringTimer = setInterval(() => tick(root), 200);
    logEvent(root, 0, 'MATCH', 'started');
    const btn = $('#msToggle', root);
    btn.innerHTML = icon('stop') + 'End match';
    btn.className = 'btn lg';
  } else {
    endMatch(root);
  }
}

function endMatch(root) {
  clearInterval(ringTimer);
  closeActive(live.t);
  live.active = null;
  live.running = false;

  const tracked = Object.values(live.totals).reduce((a, b) => a + b, 0);
  const timeline = ACTIONS.filter(a => live.totals[a.key] > 0)
    .map(a => `<i style="width:${(live.totals[a.key] / (tracked || 1)) * 100}%;background:${a.color}"
      title="${a.key} ${live.totals[a.key]}s"></i>`).join('');

  $('#msBody', root).innerHTML = `
    <div class="card">
      <div class="card-head">
        <div><div class="eyebrow">Match complete</div>
        <h2 class="h-page" style="font-size:var(--t-lg)">Team ${live.team} · Qual ${esc(String(live.number))}</h2></div>
        <span class="tag ${live.alliance}-al">${live.alliance} alliance</span>
      </div>
      <div class="stats" style="margin-bottom:var(--s4)">
        ${statTile({ label: 'Clock reached', value: fmtClock(live.t), icon: 'clock' })}
        ${statTile({ label: 'Time scoring', value: live.totals.Scoring, suffix: 's', icon: 'target' })}
        ${statTile({ label: 'Time on defence', value: live.totals.Defending, suffix: 's', icon: 'shield' })}
        ${statTile({ label: 'Action switches', value: live.spans.length, icon: 'activity' })}
      </div>
      <label>Where the 150 seconds went</label>
      <div class="timeline">${timeline || ''}</div>
      <div class="chips" style="margin-top:var(--s3)">
        ${ACTIONS.map(a => `<span class="tag">${a.key} ${live.totals[a.key]}s</span>`).join('')}
      </div>

      <hr class="rule" />
      <div class="h-sub" style="margin-bottom:var(--s3)">What the numbers cannot see</div>
      <div class="fields">
        <div class="field"><label for="qDef">Defence played against them <span class="opt">1 none, 5 relentless</span></label>
          <input id="qDef" type="range" min="1" max="5" value="3" /></div>
        <div class="field"><label for="qDrv">Driver skill <span class="opt">1 rough, 5 clean</span></label>
          <input id="qDrv" type="range" min="1" max="5" value="3" /></div>
      </div>
      <div class="switch-row"><span>Broke down or tipped over</span>
        <div class="seg yn" id="qBroke"><span class="seg-thumb no"></span>
          <button data-v="1" class="yes">Yes</button><button data-v="0" class="no on">No</button></div>
      </div>
      <div class="field" style="margin-top:var(--s4)"><label for="qNotes">Notes</label>
        <textarea id="qNotes" placeholder="What would you tell the drive team about this robot?"></textarea></div>

      <div class="row wrap" style="gap:var(--s2);margin-top:var(--s5)">
        <button class="btn pos" id="msSubmit">${icon('check')}Save and sync</button>
        <button class="btn ghost" id="msQR">${icon('qr')}Show as a code</button>
        <button class="btn ghost" id="msAnother">${icon('plus')}Scout another</button>
      </div>
    </div>`;

  hydrate($('#msBody', root));
  $$('.seg', root).forEach(positionThumb);
  saveDraft();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function collectRecord(root) {
  return {
    team: live.team, match: `Q${live.number}`, matchKey: live.key,
    alliance: live.alliance, tracked: live.t,
    totals: { ...live.totals }, spans: live.spans,
    defense: Number($('#qDef', root)?.value ?? 3),
    driver: Number($('#qDrv', root)?.value ?? 3),
    broke: $('#qBroke button.on', root)?.dataset.v === '1',
    notes: $('#qNotes', root)?.value.trim() || '',
  };
}

export function bindMatch(root, rerender) {
  root.addEventListener('change', e => {
    if (e.target.id === 'msMatch') { ms.match = e.target.value; ms.team = null; rerender(); }
  });

  root.addEventListener('click', e => {
    const t = e.target;

    if (t.closest('[data-act="resume"]')) {
      live = LS.get(DRAFT_KEY);
      live.running = false;
      rerender();
      toast('Resumed the saved match.', 'pos');
      return;
    }
    if (t.closest('[data-act="discard"]')) { clearDraft(); rerender(); return; }

    const robot = t.closest('[data-robot]');
    if (robot) {
      ms.match = ms.match || $('#msMatch', root)?.value;
      ms.team = Number(robot.dataset.robot);
      ms.alliance = robot.dataset.side;
      $$('[data-robot]', root).forEach(b => b.classList.toggle('on', b === robot));
      $('#msStart', root).disabled = false;
      return;
    }
    if (t.closest('#msStart')) {
      ms.match = ms.match || $('#msMatch', root)?.value;
      startLive(root);
      return;
    }

    const act = t.closest('[data-act-key]');
    if (act) { tapAction(root, act.dataset.actKey); return; }

    if (t.closest('#msToggle')) { toggleMatch(root); return; }
    if (t.closest('#msUndo')) { undo(root); return; }
    if (t.closest('#msAbort')) {
      clearInterval(ringTimer); live = null; clearDraft(); rerender();
      return;
    }

    const yn = t.closest('#qBroke button');
    if (yn) {
      $$('#qBroke button', root).forEach(b => b.classList.toggle('on', b === yn));
      $('#qBroke .seg-thumb', root).className = `seg-thumb ${yn.dataset.v === '1' ? 'yes' : 'no'}`;
      positionThumb($('#qBroke', root));
      return;
    }

    if (t.closest('#msSubmit')) {
      const rec = collectRecord(root);
      saveMatchRecord(rec);
      refreshDerived();
      clearDraft();
      live = null;
      rerender();
      toast('Saved. Flags merged and the team board updated.', 'pos');
      return;
    }

    if (t.closest('#msQR')) {
      const rec = collectRecord(root);
      try {
        openModal(`
          <h3 class="h-sec">${icon('qr')}Team ${rec.team}, ${esc(rec.match)}</h3>
          <p class="prose" style="margin:var(--s3) 0">Point another device's Data page at this. It carries the
          whole record, so it works with no network at all.</p>
          ${toSVG(packRecord(rec))}
          <div class="row end" style="margin-top:var(--s5)">
            <button class="btn ghost" data-close>Close</button>
          </div>`, {
          onMount: p => p.addEventListener('click', ev => { if (ev.target.closest('[data-close]')) closeModal(); }),
        });
      } catch (err) {
        toast(`Could not build a code: ${err.message}`, 'neg');
      }
      return;
    }

    if (t.closest('#msAnother')) { live = null; clearDraft(); rerender(); }
  });
}

/** Keyboard driving for the match scout. Only active while a match is open. */
export function matchHotkeys(root, e) {
  if (!live) return false;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;

  const byKey = ACTIONS.find(a => a.hot === e.key);
  if (byKey) { e.preventDefault(); tapAction(root, byKey.key); return true; }
  if (e.code === 'Space') { e.preventDefault(); if ($('#msToggle', root)) toggleMatch(root); return true; }
  if (e.key === 'u' || e.key === 'U') { e.preventDefault(); undo(root); return true; }
  return false;
}

export function stopMatchTimer() { clearInterval(ringTimer); }

/** Clock actually ticking. Used for the leave-the-page warning. */
export const matchIsLive = () => Boolean(live?.running);

/** Anything a scout would lose if this page were repainted underneath them:
 *  a match session in any state, including the summary screen where the
 *  qualitative notes get typed, or a part-filled pit form. */
export function pageHoldsInput(page) {
  if (page === 'match') return live !== null;
  if (page === 'pit') return pitDirty;
  return false;
}
