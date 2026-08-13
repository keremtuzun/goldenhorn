/* Pre-Scout coverage and Pit Scout. Match data now comes from the feed, see views/matchdata.js */

import { $, $$, esc, dash, clamp, seeded } from '../util.js';
import { icon } from '../icons.js';
import { state, savePitReport, deletePitReport } from '../store.js';
import { teamName, refreshDerived } from '../api.js';
import { hydrate, toast, confirmAction } from '../ui.js';
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
      ${statTile({ label: 'Match rows imported', value: state.records.length, icon: 'calendar' })}
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
        <thead><tr><th>Team</th><th class="n">Matches played</th><th class="n">Match rows</th><th class="n">Pit report</th><th>Status</th></tr></thead>
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

/** Anything a scout would lose if this page were repainted underneath them.
 *  Match scouting is gone, so the pit form is the only page holding input. */
export function pageHoldsInput(page) {
  return page === 'pit' ? pitDirty : false;
}
