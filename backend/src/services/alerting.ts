/**
 * Alerting Telegram — vérifie les seuils à chaque webhook
 * Envoie via `openclaw agent --agent hub --message ...` (child_process.exec)
 */

import { exec } from 'child_process';
import type { SystemMetrics, AgentInfo } from '../types.js';

interface AlertConfig {
  cpuThreshold: number;      // 90
  cpuDurationMs: number;     // 300000 (5 min)
  ramThreshold: number;      // 95
  cooldownMs: number;        // 600000 (10 min par serveur par type)
  reporterDownMs: number;    // 300000 (5 min sans report)
}

const CONFIG: AlertConfig = {
  cpuThreshold: 90,
  cpuDurationMs: 5 * 60 * 1000,    // 5 min
  ramThreshold: 95,
  cooldownMs: 10 * 60 * 1000,      // 10 min
  reporterDownMs: 5 * 60 * 1000,   // 5 min
};

type AlertType = 'cpu' | 'ram' | 'reporter_down';

interface ServerAlertState {
  cpuHighSince: number | null;   // timestamp ms où cpu a dépassé le seuil
  lastAlertAt: Map<AlertType, number>; // timestamp ms du dernier envoi
  lastReportAt: number;          // timestamp ms du dernier webhook reçu
}

const alertState = new Map<string, ServerAlertState>();

function getState(serverId: string): ServerAlertState {
  let s = alertState.get(serverId);
  if (!s) {
    s = {
      cpuHighSince: null,
      lastAlertAt: new Map(),
      lastReportAt: Date.now(),
    };
    alertState.set(serverId, s);
  }
  return s;
}

function canAlert(state: ServerAlertState, type: AlertType): boolean {
  const last = state.lastAlertAt.get(type) ?? 0;
  return Date.now() - last >= CONFIG.cooldownMs;
}

function markAlerted(state: ServerAlertState, type: AlertType): void {
  state.lastAlertAt.set(type, Date.now());
}

function sendTelegramAlert(message: string): void {
  // Échapper les guillemets dans le message pour éviter l'injection shell
  const safe = message.replace(/"/g, '\\"');
  const cmd = `openclaw agent --agent hub --message "${safe}" --deliver --channel telegram --reply-to 1555054582`;
  exec(cmd, (err, _stdout, stderr) => {
    if (err) {
      console.error(`[alerting] Failed to send Telegram alert: ${stderr || err.message}`);
    } else {
      console.log(`[alerting] Alert sent: ${message}`);
    }
  });
}

/**
 * Vérifie les seuils pour un serveur après chaque webhook.
 * @param serverId  ID du serveur (ex: "NOVA")
 * @param system    Métriques système du reporter v2 (peut être undefined)
 * @param agents    Liste des agents du serveur
 */
export function checkAlerts(
  serverId: string,
  system: SystemMetrics | undefined,
  agents: AgentInfo[],
): void {
  const state = getState(serverId);
  const now = Date.now();

  // Mise à jour du dernier report
  state.lastReportAt = now;

  if (system) {
    const cpu = system.cpu ?? 0;
    const ram = system.memPct ?? 0;

    // — CPU > 90% pendant 5 min consécutives
    if (cpu > CONFIG.cpuThreshold) {
      if (state.cpuHighSince === null) {
        state.cpuHighSince = now;
      } else if (now - state.cpuHighSince >= CONFIG.cpuDurationMs) {
        if (canAlert(state, 'cpu')) {
          const durationMin = Math.round((now - state.cpuHighSince) / 60000);
          sendTelegramAlert(
            `🔥 [${serverId}] CPU élevé : ${cpu.toFixed(1)}% depuis ${durationMin} min (seuil : ${CONFIG.cpuThreshold}%)`,
          );
          markAlerted(state, 'cpu');
        }
      }
    } else {
      // CPU redescendu sous le seuil, reset
      state.cpuHighSince = null;
    }

    // — RAM > 95% → alerte immédiate
    if (ram > CONFIG.ramThreshold) {
      if (canAlert(state, 'ram')) {
        sendTelegramAlert(
          `🧠 [${serverId}] RAM critique : ${ram.toFixed(1)}% utilisée (seuil : ${CONFIG.ramThreshold}%)`,
        );
        markAlerted(state, 'ram');
      }
    }
  }

  // Agents passés en paramètre — disponibles pour futurs checks si besoin
  void agents;
}

/**
 * Vérifie périodiquement si un serveur n'a plus envoyé de report depuis > 5 min.
 * À appeler depuis un setInterval dans index.ts ou poller.ts.
 */
export function checkReporterDown(): void {
  const now = Date.now();
  for (const [serverId, state] of alertState.entries()) {
    const silenceDuration = now - state.lastReportAt;
    if (silenceDuration >= CONFIG.reporterDownMs) {
      if (canAlert(state, 'reporter_down')) {
        const silenceMin = Math.round(silenceDuration / 60000);
        sendTelegramAlert(
          `📵 [${serverId}] Reporter silencieux depuis ${silenceMin} min — serveur peut-être down ?`,
        );
        markAlerted(state, 'reporter_down');
      }
    }
  }
}
