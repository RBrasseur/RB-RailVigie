// RB RailVigie (v2) — Application autonome de contrôle des intervalles, repos, week-ends, compteurs et heures supplémentaires
// Sans calcul de primes ni connexion externe (version de vérification complète)

let scheduleData = [];
let lastComputedReport = null;

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const CODES = ['BVTS', 'RX', 'OO', 'ELH', 'REC', 'WKD', 'ZZ', 'ZB', 'BLH', 'BELH', 'BTH', 'BTULH', 'NMBS', '-'];

// Normalisation pour la reconnaissance souple du nom ("Rémy Brasseur" <-> "Rémy Marcel L BRASSEUR")
function normalizeStr(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .trim();
}

function checkDriverMatch() {
  const rawInput = document.getElementById('driverInput').value;
  const rawTarget = document.getElementById('e500FullName').value;
  const query = normalizeStr(rawInput);
  const target = normalizeStr(rawTarget);
  const infoEl = document.getElementById('driverMatchInfo');

  if (!query) {
    infoEl.textContent = 'Case vierge par défaut (prête pour partage aux collègues).';
    infoEl.style.color = 'var(--muted)';
    return true;
  }

  // Reconnaissance explicite "Rémy Brasseur" -> "Rémy Marcel L BRASSEUR"
  const isRemyShort = (query === 'REMY BRASSEUR' || query === 'BRASSEUR REMY');
  if (isRemyShort && (!target || target.includes('REMY') && target.includes('BRASSEUR'))) {
    if (!rawTarget) {
      document.getElementById('e500FullName').value = 'Rémy Marcel L BRASSEUR';
    }
    infoEl.textContent = 'Identité reconnue : "Rémy Brasseur" ➔ "Rémy Marcel L BRASSEUR".';
    infoEl.style.color = 'var(--green)';
    return true;
  }

  if (!target) {
    infoEl.textContent = `Conducteur actif : ${rawInput}`;
    infoEl.style.color = 'var(--green)';
    return true;
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);
  const targetTokens = target.split(/\s+/).filter(Boolean);
  const allMatched = queryTokens.every(qt => targetTokens.some(tt => tt.includes(qt) || qt.includes(tt)));

  if (allMatched) {
    infoEl.textContent = `Identité reconnue : "${rawInput}" correspond à "${document.getElementById('e500FullName').value}".`;
    infoEl.style.color = 'var(--green)';
  } else {
    infoEl.textContent = `Attention : "${rawInput}" ne correspond pas à "${document.getElementById('e500FullName').value}".`;
    infoEl.style.color = 'var(--red)';
  }
  return allMatched;
}

function parseTimeToMin(str) {
  if (!str || typeof str !== 'string') return null;
  const clean = str.trim();
  const match = clean.match(/^(\d{1,2})[:hH](\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 29 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function formatMinToHHMM(totalMin) {
  const sign = totalMin < 0 ? '-' : '';
  const abs = Math.round(Math.abs(totalMin));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h${String(m).padStart(2, '0')}`;
}

function getDaysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function getDayOfWeek(year, month, day) {
  return new Date(year, month - 1, day).getDay(); // 0=Dim .. 6=Sam
}

function getISOWeekKey(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-S${String(weekNo).padStart(2, '0')}`;
}

function createBlankSchedule(month, year) {
  const days = getDaysInMonth(month, year);
  const arr = [];
  for (let d = 1; d <= days; d++) {
    arr.push({
      day: d,
      code: '-',
      start: '',
      end: '',
      lit: 'none', // 'none', 'aller', 'retour', '2'
      start2: '',
      end2: '',
      trajetMin: 0,
      plannedEndBeforeRT: '',
      note: ''
    });
  }
  return arr;
}

function resetBlankMonth() {
  const month = parseInt(document.getElementById('monthSelect').value, 10);
  const year = parseInt(document.getElementById('yearInput').value, 10);
  document.getElementById('driverInput').value = '';
  document.getElementById('e500FullName').value = '';
  document.getElementById('driverMatricule').value = '';
  scheduleData = createBlankSchedule(month, year);
  checkDriverMatch();
  renderTable();
  recalculateAll();
}

function rebuildMonthChange() {
  const month = parseInt(document.getElementById('monthSelect').value, 10);
  const year = parseInt(document.getElementById('yearInput').value, 10);
  const days = getDaysInMonth(month, year);
  while (scheduleData.length < days) {
    scheduleData.push({
      day: scheduleData.length + 1,
      code: '-', start: '', end: '', lit: 'none',
      start2: '', end2: '', trajetMin: 0, plannedEndBeforeRT: '', note: ''
    });
  }
  if (scheduleData.length > days) {
    scheduleData = scheduleData.slice(0, days);
  }
  renderTable();
  recalculateAll();
}

// Exemple de démonstration (Octobre 2026) — laisse la case "Nom du conducteur" vierge par défaut
function loadOctoberDemo() {
  document.getElementById('monthSelect').value = '10';
  document.getElementById('yearInput').value = '2026';
  document.getElementById('e500FullName').value = 'Rémy Marcel L BRASSEUR';
  document.getElementById('driverMatricule').value = '899008349';
  checkDriverMatch();

  scheduleData = createBlankSchedule(10, 2026);
  const preset = {
    1:  { code: 'BVTS', start: '13:00', end: '22:35', lit: 'none' },
    2:  { code: 'BVTS', start: '13:00', end: '22:00', lit: 'none' },
    3:  { code: 'OO',   start: '',      end: '',      lit: 'none' },
    4:  { code: 'RX',   start: '',      end: '',      lit: 'none' },
    5:  { code: 'BVTS', start: '08:00', end: '15:36', lit: 'none' },
    6:  { code: 'BVTS', start: '08:00', end: '15:36', lit: 'none' },
    7:  { code: 'BVTS', start: '08:00', end: '15:36', lit: 'none' },
    8:  { code: 'BVTS', start: '08:00', end: '15:36', lit: 'none' },
    9:  { code: 'BVTS', start: '08:00', end: '15:36', lit: 'none' },
    10: { code: 'RX',   start: '',      end: '',      lit: 'none' },
    11: { code: 'RX',   start: '',      end: '',      lit: 'none' },
    12: { code: 'RX',   start: '',      end: '',      lit: 'none' },
    13: { code: 'BVTS', start: '13:00', end: '22:30', lit: 'none' },
    14: { code: 'BVTS', start: '13:00', end: '22:30', lit: 'none' },
    15: { code: 'BVTS', start: '15:55', end: '00:55', lit: 'aller', trajetMin: 40 },
    16: { code: 'BVTS', start: '18:20', end: '01:40', lit: 'retour', trajetMin: 35 },
    17: { code: 'OO',   start: '',      end: '',      lit: 'none' },
    18: { code: 'RX',   start: '',      end: '',      lit: 'none' },
    19: { code: 'RX',   start: '',      end: '',      lit: 'none' },
    20: { code: 'BVTS', start: '12:00', end: '21:45', lit: 'none' },
    21: { code: 'BVTS', start: '17:25', end: '01:40', lit: 'none' },
    22: { code: 'BVTS', start: '15:20', end: '00:15', lit: 'aller', trajetMin: 30 },
    23: { code: 'BVTS', start: '13:55', end: '20:50', lit: 'retour', trajetMin: 25 },
    24: { code: 'RX',   start: '',      end: '',      lit: 'none' },
    25: { code: 'RX',   start: '',      end: '',      lit: 'none' },
    26: { code: 'ELH',  start: '',      end: '',      lit: 'none' },
    27: { code: 'ELH',  start: '',      end: '',      lit: 'none' },
    28: { code: 'BVTS', start: '18:15', end: '01:40', lit: 'none' },
    29: { code: 'BVTS', start: '15:20', end: '00:15', lit: 'aller', trajetMin: 30 },
    30: { code: 'BVTS', start: '13:48', end: '20:50', lit: 'retour', trajetMin: 25 },
    31: { code: 'OO',   start: '',      end: '',      lit: 'none' }
  };

  scheduleData.forEach(row => {
    const p = preset[row.day];
    if (p) {
      row.code = p.code;
      row.start = p.start;
      row.end = p.end;
      row.lit = p.lit;
      row.trajetMin = p.trajetMin || 0;
      row.plannedEndBeforeRT = p.end;
    }
  });

  renderTable();
  recalculateAll();
}

function renderTable() {
  const tbody = document.getElementById('scheduleBody');
  const month = parseInt(document.getElementById('monthSelect').value, 10);
  const year = parseInt(document.getElementById('yearInput').value, 10);

  tbody.innerHTML = scheduleData.map((r, idx) => {
    const dow = getDayOfWeek(year, month, r.day);
    const dayLabel = `${String(r.day).padStart(2, '0')} (${DAY_NAMES[dow]})`;
    const rowClass = r.code === 'BVTS' ? 'row-bvts' : (r.code === 'RX' ? 'row-rx' : (r.code === 'OO' ? 'row-oo' : ''));

    return `
      <tr id="row-${r.day}" class="${rowClass}">
        <td style="font-weight:700;">${dayLabel}</td>
        <td>
          <select onchange="updateCell(${idx}, 'code', this.value)">
            ${CODES.map(c => `<option value="${c}" ${r.code === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </td>
        <td><input class="time-input" type="text" value="${r.start}" placeholder="HH:MM" onchange="updateCell(${idx}, 'start', this.value)"></td>
        <td><input class="time-input" type="text" value="${r.end}" placeholder="HH:MM" onchange="updateCell(${idx}, 'end', this.value)"></td>
        <td>
          <select onchange="updateCell(${idx}, 'lit', this.value)">
            <option value="none" ${r.lit === 'none' ? 'selected' : ''}>-</option>
            <option value="aller" ${r.lit === 'aller' ? 'selected' : ''}>🛏️ 1er Lit (Aller Hôtel)</option>
            <option value="retour" ${r.lit === 'retour' ? 'selected' : ''}>🛏️ 2e Lit (Retour Hôtel)</option>
            <option value="2" ${r.lit === '2' ? 'selected' : ''}>🛏️² Lit 2 (Même jour)</option>
          </select>
        </td>
        <td>
          <input class="time-input" type="text" value="${r.start2 ? r.start2 + '-' + r.end2 : ''}"
            placeholder="HH:MM-HH:MM" title="Horaires de la 2e prestation (si Lit 2)"
            onchange="updateSecondShift(${idx}, this.value)">
        </td>
        <td><input class="num-input" type="number" min="0" value="${r.trajetMin || 0}" onchange="updateCell(${idx}, 'trajetMin', parseInt(this.value||0,10))"></td>
        <td><input class="time-input" type="text" value="${r.plannedEndBeforeRT}" placeholder="HH:MM" onchange="updateCell(${idx}, 'plannedEndBeforeRT', this.value)"></td>
        <td><input type="text" style="min-width:120px;" value="${r.note || ''}" placeholder="Train / Motif" onchange="updateCell(${idx}, 'note', this.value)"></td>
        <td id="cell-dur-${r.day}">-</td>
        <td id="cell-qual-${r.day}">-</td>
        <td id="cell-rest-${r.day}">-</td>
        <td id="cell-flags-${r.day}">-</td>
      </tr>
    `;
  }).join('');
}

function updateCell(idx, field, val) {
  scheduleData[idx][field] = val;
  if (field === 'code') {
    const tr = document.getElementById(`row-${scheduleData[idx].day}`);
    tr.className = val === 'BVTS' ? 'row-bvts' : (val === 'RX' ? 'row-rx' : (val === 'OO' ? 'row-oo' : ''));
  }
  recalculateAll();
}

function updateSecondShift(idx, val) {
  const parts = (val || '').split('-');
  if (parts.length === 2) {
    scheduleData[idx].start2 = parts[0].trim();
    scheduleData[idx].end2 = parts[1].trim();
  } else {
    scheduleData[idx].start2 = '';
    scheduleData[idx].end2 = '';
  }
  recalculateAll();
}

function recalculateAll() {
  const month = parseInt(document.getElementById('monthSelect').value, 10);
  const year = parseInt(document.getElementById('yearInput').value, 10);

  let totalWorkMin = 0;
  let totalSatMin = 0;
  let totalSunMin = 0;
  let totalDailyOTMin = 0;
  let serviceCount = 0;
  let hotelCount = 0;
  let reducedRestCount = 0;
  let abnormalRest12Count = 0;

  const weeklyMinutes = {};
  const traceabilityEvents = [];
  const restAuditEvents = [];
  const activeShifts = [];

  // 1. Analyse journalière des services, week-ends et dépassements > 10h
  scheduleData.forEach(r => {
    const dow = getDayOfWeek(year, month, r.day);
    const weekKey = getISOWeekKey(year, month, r.day);
    if (!weeklyMinutes[weekKey]) weeklyMinutes[weekKey] = { min: 0, days: [] };

    let dayWorkMin = 0;
    let qualBadge = '-';
    const flags = [];

    const startMin = parseTimeToMin(r.start);
    const endMin = parseTimeToMin(r.end);

    if (r.code === 'BVTS' && startMin !== null && endMin !== null) {
      serviceCount++;
      const absStart = (r.day - 1) * 1440 + startMin;
      const absEnd = endMin >= startMin
        ? (r.day - 1) * 1440 + endMin
        : r.day * 1440 + endMin;

      let dur1 = absEnd - absStart;

      // Temps de trajet Hôtel (1er lit > 30 min, 2e lit = 100%)
      let extraTravelMin = 0;
      if (r.lit === 'aller') {
        hotelCount++;
        if (r.trajetMin > 30) {
          extraTravelMin = r.trajetMin - 30;
          flags.push(`<span class="badge b-info">+${extraTravelMin}m trajet hôtel aller</span>`);
        }
      } else if (r.lit === 'retour' && r.trajetMin > 0) {
        extraTravelMin = r.trajetMin;
        flags.push(`<span class="badge b-info">+${extraTravelMin}m trajet hôtel retour</span>`);
      } else if (r.lit === '2') {
        hotelCount++;
        if (r.trajetMin > 0) extraTravelMin = r.trajetMin;
      }

      dayWorkMin += dur1 + extraTravelMin;

      activeShifts.push({
        day: r.day,
        weekKey,
        absStart,
        absEnd,
        lit: r.lit,
        startStr: r.start,
        endStr: r.end
      });

      // Découcher Lit "2" (Aller-retour sur la même journée)
      if (r.lit === '2') {
        const s2 = parseTimeToMin(r.start2);
        const e2 = parseTimeToMin(r.end2);
        if (s2 !== null && e2 !== null) {
          let absS2 = (r.day - 1) * 1440 + s2;
          if (absS2 < absEnd) absS2 += 1440;
          let absE2 = e2 >= s2 ? (r.day - 1) * 1440 + e2 : r.day * 1440 + e2;
          if (absE2 < absS2) absE2 += 1440;

          const hotelRestSameDay = absS2 - absEnd;
          if (hotelRestSameDay < 9 * 60) {
            restAuditEvents.push({
              level: 'err',
              day: r.day,
              title: `Jour ${r.day} — INFRACTION Découcher Lit 2 < 9h00 (${formatMinToHHMM(hotelRestSameDay)})`,
              detail: `Coupure hôtel le même jour entre ${r.end} et ${r.start2} inférieure au minimum de 9h00.`
            });
            flags.push(`<span class="badge b-err">Hôtel ${formatMinToHHMM(hotelRestSameDay)} &lt;9h</span>`);
          } else {
            flags.push(`<span class="badge b-info">Lit 2 : Hôtel ${formatMinToHHMM(hotelRestSameDay)}</span>`);
          }

          dayWorkMin += (absE2 - absS2);
          activeShifts.push({
            day: r.day,
            weekKey,
            absStart: absS2,
            absEnd: absE2,
            lit: 'retour',
            startStr: r.start2,
            endStr: r.end2
          });
        }
      }

      // Règle du Week-end (selon le jour de début de la prestation)
      if (dow === 6) {
        totalSatMin += dayWorkMin;
        qualBadge = `<span class="badge b-info">100% Samedi</span>`;
        traceabilityEvents.push({
          type: 'WEEKEND',
          day: r.day,
          label: `Jour ${r.day} (Sam) : Heures Samedi (${formatMinToHHMM(dayWorkMin)})`,
          detail: `Prestation débutée le samedi à ${r.start} (fin ${r.end}) ➔ 100 % comptabilisé en Samedi.`
        });
      } else if (dow === 0) {
        totalSunMin += dayWorkMin;
        qualBadge = `<span class="badge b-info">100% Dimanche</span>`;
        traceabilityEvents.push({
          type: 'WEEKEND',
          day: r.day,
          label: `Jour ${r.day} (Dim) : Heures Dimanche (${formatMinToHHMM(dayWorkMin)})`,
          detail: `Prestation débutée le dimanche à ${r.start} (fin ${r.end}) ➔ 100 % comptabilisé en Dimanche.`
        });
      } else if (dow === 5 && endMin < startMin) {
        qualBadge = `<span class="badge b-ok">Ven➔Sam (100% Sem)</span>`;
      } else {
        qualBadge = `<span class="badge b-ok">Semaine</span>`;
      }

      // Détection d'un dépassement par rapport à la fin initialement prévue
      const planEndRef = parseTimeToMin(r.plannedEndBeforeRT);
      if (planEndRef !== null && planEndRef !== endMin) {
        let diffEnd = endMin - planEndRef;
        if (diffEnd < -720) diffEnd += 1440;
        if (diffEnd > 0) {
          flags.push(`<span class="badge b-warn">Dépassement +${diffEnd}m</span>`);
          traceabilityEvents.push({
            type: 'OVERRUN',
            day: r.day,
            label: `Jour ${r.day} : Dépassement de prestation (+${diffEnd} min)`,
            detail: `Fin prévue ${r.plannedEndBeforeRT} ➔ Fin réelle ${r.end}. Origine : ${r.note || 'Non précisée'}.`
          });
        }
      }

      // Heures supplémentaires journalières (> 10h00 = 600 min)
      if (dayWorkMin > 600) {
        const otDay = dayWorkMin - 600;
        totalDailyOTMin += otDay;
        flags.push(`<span class="badge b-err">HS Jour +${formatMinToHHMM(otDay)}</span>`);
        traceabilityEvents.push({
          type: 'OT_DAY',
          day: r.day,
          label: `Jour ${r.day} : Heures Sup. Journalières (+${formatMinToHHMM(otDay)})`,
          detail: `Durée totale ${formatMinToHHMM(dayWorkMin)} (> 10h00) sur le service ${r.start}-${r.end}. Origine : ${r.note || 'Prestation > 10h'}.`
        });
      }
    } else if (r.code === 'RX') {
      qualBadge = `<span class="badge b-info">Repos RX</span>`;
    } else if (r.code === 'OO') {
      qualBadge = `<span class="badge b-warn">Alternement OO</span>`;
    } else if (r.code !== '-') {
      qualBadge = `<span class="badge b-ok">${r.code}</span>`;
    }

    totalWorkMin += dayWorkMin;
    weeklyMinutes[weekKey].min += dayWorkMin;
    if (dayWorkMin > 0) weeklyMinutes[weekKey].days.push(r.day);

    const durCell = document.getElementById(`cell-dur-${r.day}`);
    const qualCell = document.getElementById(`cell-qual-${r.day}`);
    const flagsCell = document.getElementById(`cell-flags-${r.day}`);
    const restCell = document.getElementById(`cell-rest-${r.day}`);
    if (durCell) durCell.textContent = dayWorkMin > 0 ? formatMinToHHMM(dayWorkMin) : '-';
    if (qualCell) qualCell.innerHTML = qualBadge;
    if (flagsCell) flagsCell.innerHTML = flags.length ? flags.join(' ') : '-';
    if (restCell) restCell.innerHTML = '-';
    const rowEl = document.getElementById(`row-${r.day}`);
    if (rowEl) rowEl.classList.remove('row-anomaly');
  });

  // 2. Contrôle strict des intervalles entre prestations (14h, <=12h anormal, rattrapage, hôtel 9h, RX 38h/62h vs OO)
  let pendingHomeRestDebtMin = 0;
  let pendingDebtOriginDay = null;
  const weeklyReductionsCount = {};

  for (let i = 1; i < activeShifts.length; i++) {
    const prev = activeShifts[i - 1];
    const curr = activeShifts[i];
    const restMin = curr.absStart - prev.absEnd;
    const restCell = document.getElementById(`cell-rest-${curr.day}`);
    const rowEl = document.getElementById(`row-${curr.day}`);

    const betweenDays = scheduleData.filter(d => d.day > prev.day && d.day < curr.day);
    const rxCount = betweenDays.filter(d => d.code === 'RX').length;
    const ooCount = betweenDays.filter(d => d.code === 'OO').length;
    const isHotelRest = (prev.lit === 'aller') && (curr.lit === 'retour');

    if (isHotelRest) {
      // Découcher à l'hôtel : minimum 9h00, et si un rattrapage <14h est en attente, on saute au repos d'après
      if (restMin < 9 * 60) {
        if (restCell) restCell.innerHTML = `<span class="badge b-err">Hôtel ${formatMinToHHMM(restMin)} (&lt;9h!)</span>`;
        if (rowEl) rowEl.classList.add('row-anomaly');
        restAuditEvents.push({
          level: 'err',
          day: curr.day,
          title: `Jour ${curr.day} — INFRACTION Repos Hôtel < 9h00 (${formatMinToHHMM(restMin)})`,
          detail: `Fin le J${prev.day} à ${prev.endStr}, reprise le J${curr.day} à ${curr.startStr}. Minimum réglementaire à l'hôtel : 9h00.`
        });
      } else {
        const reportMsg = pendingHomeRestDebtMin > 0
          ? ` (Rattrapage en attente de +${formatMinToHHMM(pendingHomeRestDebtMin)} du J${pendingDebtOriginDay} reporté au repos domicile suivant)`
          : '';
        if (restCell) restCell.innerHTML = `<span class="badge b-info">Hôtel ${formatMinToHHMM(restMin)}</span>`;
        restAuditEvents.push({
          level: 'info',
          day: curr.day,
          title: `Jour ${curr.day} — Découcher Hôtel conforme (${formatMinToHHMM(restMin)})`,
          detail: `Repos hors domicile >= 9h00 entre J${prev.day} (${prev.endStr}) et J${curr.day} (${curr.startStr}).${reportMsg}`
        });
      }
    } else if (rxCount > 0 || ooCount > 0) {
      // Vérification des jours de repos périodiques RX (38h pour 1 RX, 62h pour 2 RX, etc.) et Alternements OO
      const requiredRxMin = rxCount > 0 ? (38 * 60 + (rxCount - 1) * 24 * 60) : 38 * 60;

      if (rxCount > 0 && restMin < requiredRxMin) {
        if (restCell) restCell.innerHTML = `<span class="badge b-err">${formatMinToHHMM(restMin)} (RX &lt; ${requiredRxMin/60}h)</span>`;
        if (rowEl) rowEl.classList.add('row-anomaly');
        restAuditEvents.push({
          level: 'err',
          day: curr.day,
          title: `Jours ${prev.day}➔${curr.day} — ERREUR RX : ${formatMinToHHMM(restMin)} au lieu de ${requiredRxMin / 60}h00`,
          detail: `L'intervalle entre J${prev.day} (${prev.endStr}) et J${curr.day} (${curr.startStr}) ne respecte pas les ${requiredRxMin / 60}h00 requises. Il faut remplacer le RX par un Alternement (OO).`
        });
      } else if (ooCount > 0 && rxCount === 0) {
        if (restMin < 38 * 60) {
          if (restCell) restCell.innerHTML = `<span class="badge b-ok">OO (${formatMinToHHMM(restMin)} &lt;38h)</span>`;
          restAuditEvents.push({
            level: 'ok',
            day: curr.day,
            title: `Jours ${prev.day}➔${curr.day} — Alternement (OO) valide (${formatMinToHHMM(restMin)})`,
            detail: `Les 38h00 ne pouvant pas être atteintes (${formatMinToHHMM(restMin)}), l'utilisation de la période blanche (OO) est conforme.`
          });
        } else {
          if (restCell) restCell.innerHTML = `<span class="badge b-err">OO invalide (${formatMinToHHMM(restMin)} &ge;38h)</span>`;
          if (rowEl) rowEl.classList.add('row-anomaly');
          restAuditEvents.push({
            level: 'err',
            day: curr.day,
            title: `Jours ${prev.day}➔${curr.day} — ANOMALIE Alternement (OO) : Intervalle de ${formatMinToHHMM(restMin)} (>= 38h00)`,
            detail: `L'alternement (OO) ne peut être mis que si les 38h ne peuvent pas être respectées. Ici (${formatMinToHHMM(restMin)}), un jour de repos RX doit être inscrit.`
          });
        }
      } else {
        if (restCell) restCell.innerHTML = `<span class="badge b-ok">RX ${formatMinToHHMM(restMin)}</span>`;
      }
      pendingHomeRestDebtMin = 0;
      pendingDebtOriginDay = null;
    } else {
      // Intervalle journalier à domicile (base 14h00, sans code inscrit)
      const expectedMin = 14 * 60 + pendingHomeRestDebtMin;

      // 1) Contrôle du rattrapage dû d'un précédent repos réduit
      if (pendingHomeRestDebtMin > 0) {
        if (restMin < expectedMin) {
          if (rowEl) rowEl.classList.add('row-anomaly');
          restAuditEvents.push({
            level: 'err',
            day: curr.day,
            title: `Jour ${curr.day} — INFRACTION Rattrapage non rendu (${formatMinToHHMM(restMin)} au lieu de ${formatMinToHHMM(expectedMin)})`,
            detail: `Suite au repos réduit du J${pendingDebtOriginDay}, cet intervalle à domicile devait être d'au moins 14h00 + ${formatMinToHHMM(pendingHomeRestDebtMin)} = ${formatMinToHHMM(expectedMin)}.`
          });
        } else {
          restAuditEvents.push({
            level: 'ok',
            day: curr.day,
            title: `Jour ${curr.day} — Rattrapage du repos réduit (J${pendingDebtOriginDay}) bien restitué (${formatMinToHHMM(restMin)})`,
            detail: `Les +${formatMinToHHMM(pendingHomeRestDebtMin)} manquants ont bien été ajoutés aux 14h00 (attendu : ${formatMinToHHMM(expectedMin)}).`
          });
        }
        pendingHomeRestDebtMin = 0;
        pendingDebtOriginDay = null;
      }

      // 2) Contrôle du seuil de 14h00 sur le repos actuel
      if (restMin < 14 * 60) {
        reducedRestCount++;
        const shortfall = 14 * 60 - restMin;
        pendingHomeRestDebtMin = shortfall;
        pendingDebtOriginDay = curr.day;
        weeklyReductionsCount[curr.weekKey] = (weeklyReductionsCount[curr.weekKey] || 0) + 1;

        if (restMin < 9 * 60) {
          abnormalRest12Count++;
          if (restCell) restCell.innerHTML = `<span class="badge b-err">${formatMinToHHMM(restMin)} (&lt;9h ILLÉGAL)</span>`;
          if (rowEl) rowEl.classList.add('row-anomaly');
          restAuditEvents.push({
            level: 'err',
            day: curr.day,
            title: `Jour ${curr.day} — INFRACTION GRAVE : Repos domicile < 9h00 (${formatMinToHHMM(restMin)})`,
            detail: `Fin J${prev.day} à ${prev.endStr}, reprise J${curr.day} à ${curr.startStr}. En dessous du minimum absolu de 9h00.`
          });
        } else if (restMin <= 12 * 60) {
          abnormalRest12Count++;
          if (restCell) restCell.innerHTML = `<span class="badge b-err">ANORMAL ${formatMinToHHMM(restMin)} (&le;12h)</span>`;
          if (rowEl) rowEl.classList.add('row-anomaly');
          restAuditEvents.push({
            level: 'err',
            day: curr.day,
            title: `Jour ${curr.day} — ANOMALIE : Repos réduit à 12h00 ou moins (${formatMinToHHMM(restMin)})`,
            detail: `Intervalle J${prev.day} (${prev.endStr}) ➔ J${curr.day} (${curr.startStr}) = ${formatMinToHHMM(restMin)} (<= 12h00). Temps manquant à rendre au prochain repos domicile (hors découcher) : +${formatMinToHHMM(shortfall)}.`
          });
        } else {
          if (restCell) restCell.innerHTML = `<span class="badge b-warn">Réduit ${formatMinToHHMM(restMin)} (-${formatMinToHHMM(shortfall)})</span>`;
          restAuditEvents.push({
            level: 'warn',
            day: curr.day,
            title: `Jour ${curr.day} — Repos réduit entre 12h01 et 13h59 (${formatMinToHHMM(restMin)})`,
            detail: `Temps manquant de +${formatMinToHHMM(shortfall)} à rendre obligatoirement lors du prochain repos à domicile (saute le découcher s'il y en a un).`
          });
        }

        if (weeklyReductionsCount[curr.weekKey] > 1) {
          if (rowEl) rowEl.classList.add('row-anomaly');
          restAuditEvents.push({
            level: 'err',
            day: curr.day,
            title: `Semaine ${curr.weekKey} (Jour ${curr.day}) — INFRACTION : Plus d'un repos réduit (<14h) sur la semaine`,
            detail: `Réduction n°${weeklyReductionsCount[curr.weekKey]} sur la même semaine (maximum autorisé : 1 fois par semaine).`
          });
        }
      } else {
        if (restCell) restCell.innerHTML = `<span class="badge b-ok">${formatMinToHHMM(restMin)}</span>`;
      }
    }
  }

  // 3. Heures supplémentaires hebdomadaires (> 46h00)
  let totalWeeklyOTMin = 0;
  Object.entries(weeklyMinutes).forEach(([wk, obj]) => {
    if (obj.min > 46 * 60) {
      const exc = obj.min - 46 * 60;
      totalWeeklyOTMin += exc;
      traceabilityEvents.push({
        type: 'OT_WEEK',
        day: obj.days[0] || 1,
        label: `Semaine ${wk} : Heures Sup. Hebdomadaires (+${formatMinToHHMM(exc)})`,
        detail: `Total hebdomadaire de ${formatMinToHHMM(obj.min)} sur les jours [${obj.days.join(', ')}] (dépassement du seuil de 46h00).`
      });
    }
  });

  // 4. Heures supplémentaires trimestrielles (> 38h00 de moyenne hebdomadaire)
  const prevQHours = parseFloat(document.getElementById('prevQuarterHours').value || '0');
  const qWeeks = parseFloat(document.getElementById('quarterWeeks').value || '13');
  const quarterThresholdMin = Math.round(qWeeks * 38 * 60);
  const totalQuarterMin = Math.round(prevQHours * 60) + totalWorkMin;
  const totalQuarterOTMin = Math.max(0, totalQuarterMin - quarterThresholdMin);

  if (totalQuarterOTMin > 0) {
    traceabilityEvents.push({
      type: 'OT_QUARTER',
      day: 31,
      label: `Trimestre (${qWeeks} sem.) : Heures Sup. Trimestrielles (+${formatMinToHHMM(totalQuarterOTMin)})`,
      detail: `Volume trimestriel consolidé de ${formatMinToHHMM(totalQuarterMin)} pour un seuil de ${formatMinToHHMM(quarterThresholdMin)} (${qWeeks} sem. × 38h).`
    });
  }

  // 5. Mise à jour des compteurs (RX, OO, ELH, REC, WKD, ZZ...)
  const usedCounts = { RX: 0, OO: 0, ELH: 0, REC: 0, WKD: 0, ZZ: 0, ZB: 0, BLH: 0, BELH: 0, BTH: 0, BTULH: 0, NMBS: 0 };
  scheduleData.forEach(r => {
    if (usedCounts[r.code] !== undefined) usedCounts[r.code]++;
  });
  const baseRX = parseFloat(document.getElementById('cnt_RX').value || '0');
  const baseBELH = parseFloat(document.getElementById('cnt_BELH').value || '0');
  const baseREC = parseFloat(document.getElementById('cnt_REC').value || '0');
  const baseWKD = parseFloat(document.getElementById('cnt_WKD').value || '0');
  const baseZZ = parseFloat(document.getElementById('cnt_ZZ').value || '0');
  const baseZB = parseFloat(document.getElementById('cnt_ZB').value || '0');

  document.getElementById('counterSummaryBox').innerHTML =
    `Utilisés ce mois : <strong>${usedCounts.RX} RX</strong> (Solde RX : ${baseRX - usedCounts.RX}) • ` +
    `<strong>${usedCounts.OO} OO (Alternements)</strong> • ` +
    `<strong>${usedCounts.ELH} ELH</strong> (Solde BELH : ${baseBELH - usedCounts.ELH}) • ` +
    `<strong>WKD : ${baseWKD - usedCounts.WKD}</strong> • <strong>REC : ${baseREC}h</strong> • ` +
    `<strong>ZZ : ${baseZZ + usedCounts.ZZ}</strong> • <strong>ZB : ${baseZB - usedCounts.ZB}</strong>`;

  // 6. Mise à jour des KPIs
  document.getElementById('kpiTotalHours').textContent = formatMinToHHMM(totalWorkMin);
  document.getElementById('kpiServiceCount').textContent = `${serviceCount} prestation(s) BVTS`;
  document.getElementById('kpiWeekendHours').textContent = `${formatMinToHHMM(totalSatMin)} / ${formatMinToHHMM(totalSunMin)}`;
  document.getElementById('kpiOvertimeDayWeek').textContent = `${formatMinToHHMM(totalDailyOTMin)} / ${formatMinToHHMM(totalWeeklyOTMin)}`;
  document.getElementById('kpiOvertimeQuarter').textContent = formatMinToHHMM(totalQuarterOTMin);
  document.getElementById('kpiQuarterSub').textContent = `Cumul trimestre : ${formatMinToHHMM(totalQuarterMin)} / ${formatMinToHHMM(quarterThresholdMin)}`;
  document.getElementById('kpiRxOoCount').textContent = `${usedCounts.RX} RX / ${usedCounts.OO} OO`;
  document.getElementById('kpiHotelCount').textContent = `${hotelCount} découcher(s)`;
  document.getElementById('kpiReducedRest').textContent = `${reducedRestCount} réduit(s) / ${abnormalRest12Count} <=12h`;

  const errCount = restAuditEvents.filter(e => e.level === 'err').length;
  const kpiAnomEl = document.getElementById('kpiAnomalies');
  const kpiRestSub = document.getElementById('kpiRestSub');
  if (errCount > 0) {
    kpiAnomEl.textContent = `${errCount} Anomalie(s)`;
    kpiAnomEl.style.color = 'var(--red)';
    kpiRestSub.textContent = 'Vérifiez le journal d'audit ci-dessous';
  } else {
    kpiAnomEl.textContent = 'Conforme';
    kpiAnomEl.style.color = 'var(--green)';
    kpiRestSub.textContent = 'Tous les intervalles & repos sont valides';
  }

  // 7. Affichage des journaux
  const restListEl = document.getElementById('restAuditList');
  restListEl.innerHTML = restAuditEvents.length
    ? restAuditEvents.map(e => `
        <div class="log-item ${e.level}">
          <strong>${e.title}</strong>
          <div style="color:var(--muted); font-size:0.76rem; margin-top:2px;">${e.detail}</div>
        </div>
      `).join('')
    : `<div class="log-item ok"><strong>Aucun problème d'intervalle détecté (Repos 14h, Hôtel 9h, RX 38h et Alternements OO respectés).</strong></div>`;

  const traceListEl = document.getElementById('traceabilityList');
  traceListEl.innerHTML = traceabilityEvents.length
    ? traceabilityEvents.map(t => `
        <div class="log-item ${t.type.startsWith('OT') ? 'err' : (t.type === 'OVERRUN' ? 'warn' : 'info')}">
          <strong>${t.label}</strong>
          <div style="color:var(--muted); font-size:0.76rem; margin-top:2px;">${t.detail}</div>
        </div>
      `).join('')
    : `<div class="log-item info">Aucune heure supplémentaire ni prestation de week-end sur la période.</div>`;

  lastComputedReport = {
    month, year,
    driverName: document.getElementById('driverInput').value || document.getElementById('e500FullName').value || 'Vierge (Non renseigné)',
    matricule: document.getElementById('driverMatricule').value || '-',
    totalWorkMin, totalSatMin, totalSunMin,
    totalDailyOTMin, totalWeeklyOTMin, totalQuarterOTMin,
    totalQuarterMin, quarterThresholdMin,
    usedCounts, hotelCount, reducedRestCount, abnormalRest12Count,
    restAuditEvents, traceabilityEvents
  };
}

// Test local d'un dépassement de prestation sur les intervalles et repos
function applyServiceOverrun() {
  const day = parseInt(document.getElementById('rtDay').value, 10);
  const newEnd = document.getElementById('rtNewEnd').value.trim();
  const reason = document.getElementById('rtReason').value.trim() || 'Dépassement de prestation';
  const feedbackEl = document.getElementById('rtQuickFeedback');

  const row = scheduleData.find(r => r.day === day);
  if (!row || row.code !== 'BVTS') {
    feedbackEl.innerHTML = `<span style="color:var(--red);">Le jour ${day} n'est pas une prestation active (BVTS).</span>`;
    return;
  }
  if (parseTimeToMin(newEnd) === null) {
    feedbackEl.innerHTML = `<span style="color:var(--red);">Format d'heure invalide. Utilisez HH:MM (ex: 03:30).</span>`;
    return;
  }

  if (!row.plannedEndBeforeRT) row.plannedEndBeforeRT = row.end;
  row.end = newEnd;
  row.note = reason;

  renderTable();
  recalculateAll();

  const impacts = lastComputedReport.restAuditEvents.filter(
    e => (e.day >= day && e.day <= day + 3) && (e.level === 'err' || e.level === 'warn')
  );
  if (impacts.length > 0) {
    feedbackEl.innerHTML = impacts.map(a =>
      `<div style="color:var(--red); font-weight:700; margin-top:4px;">⚠️ ${a.title}<br><span style="font-weight:400; color:var(--text);">${a.detail}</span></div>`
    ).join('');
  } else {
    feedbackEl.innerHTML = `<span style="color:var(--green);">Dépassement appliqué au Jour ${day} (fin à ${newEnd}). Les intervalles suivants restent conformes.</span>`;
  }
}

// Génération du PDF de traçabilité (Intervalles, Repos, Week-ends, Heures Sup.)
function generateAuditPDF() {
  recalculateAll();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const rep = lastComputedReport;
  const monthLabel = document.getElementById('monthSelect').selectedOptions[0].text;

  doc.setFontSize(15);
  doc.text(`RB RailVigie — Rapport de Conformité & Traçabilité (${monthLabel} ${rep.year})`, 14, 14);
  doc.setFontSize(9.5);
  doc.text(`Conducteur : ${rep.driverName}   |   Matricule : ${rep.matricule}   |   Édité le : ${new Date().toLocaleDateString('fr-BE')}`, 14, 20);

  // Tableau 1 : Synthèse générale
  doc.autoTable({
    startY: 24,
    head: [['Indicateur Temps & Week-end', 'Valeur', 'Indicateur Repos & Compteurs', 'Valeur']],
    body: [
      ['Heures Prestées (Mois)', formatMinToHHMM(rep.totalWorkMin), 'Jours RX / Alternements OO posés', `${rep.usedCounts.RX} RX / ${rep.usedCounts.OO} OO`],
      ['Heures Samedi / Dimanche', `${formatMinToHHMM(rep.totalSatMin)} / ${formatMinToHHMM(rep.totalSunMin)}`, 'Découchers Hôtel (min. 9h)', `${rep.hotelCount}`],
      ['Heures Sup. Jour (>10h) / Semaine (>46h)', `${formatMinToHHMM(rep.totalDailyOTMin)} / ${formatMinToHHMM(rep.totalWeeklyOTMin)}`, 'Repos réduits (<14h) / Anormaux (<=12h)', `${rep.reducedRestCount} / ${rep.abnormalRest12Count}`],
      ['Heures Sup. Trimestrielles (>38h/sem)', formatMinToHHMM(rep.totalQuarterOTMin), 'Anomalies réglementaires détectées', `${rep.restAuditEvents.filter(e=>e.level==='err').length} anomalie(s)`]
    ],
    theme: 'grid',
    styles: { fontSize: 8.5 }
  });

  // Tableau 2 : Contrôle des intervalles et repos
  const restRows = rep.restAuditEvents.map(a => [
    `Jour ${a.day}`, a.level.toUpperCase(), a.title, a.detail
  ]);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Jour', 'Niveau', 'Contrôle Intervalle / Repos / RX / OO', 'Détail & Origine']],
    body: restRows.length ? restRows : [['-', 'OK', 'Conformité totale', 'Tous les intervalles (14h, Hôtel 9h, RX 38h, OO) sont respectés.']],
    theme: 'striped',
    styles: { fontSize: 8 }
  });

  // Tableau 3 : Traçabilité des Heures Supplémentaires et Week-ends
  const traceRows = rep.traceabilityEvents.map(t => [
    `Jour ${t.day}`, t.type, t.label, t.detail
  ]);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Jour', 'Type', 'Événement (Heures Sup. / Dépassement / Week-end)', 'Traçabilité exacte (Horaires, Seuils, Train/Motif)']],
    body: traceRows.length ? traceRows : [['-', '-', 'Aucun dépassement', 'Aucune heure supplémentaire ni dépassement enregistré sur ce mois.']],
    theme: 'striped',
    styles: { fontSize: 8 }
  });

  const mNum = String(rep.month).padStart(2, '0');
  doc.save(`RB_RailVigie_Audit_${rep.year}_${mNum}.pdf`);
}

window.addEventListener('DOMContentLoaded', () => {
  resetBlankMonth();
});
