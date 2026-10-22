/*
 * Code Academy shared game bridge.
 * Uses the existing authentication.js Firebase app and the same
 * users/{uid}/notifications collection read by menu.html.
 */
import { auth, db, onAuthStateChanged } from './authentication.js';
import {
  collection, doc, getDoc, runTransaction, serverTimestamp, setDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const clean = value => String(value ?? '').trim();
const safeKey = value => clean(value).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 82) || `event_${Date.now()}`;
const roundCoins = value => Math.round(Math.max(0, Number(value) || 0) * 2) / 2;

export async function recordGameNotification({
  gameId = 'code_academy_game', gameTitle = 'Code Academy game',
  eventKey = '', title = 'Game activity saved', message = '',
  type = 'game', icon = '🎮', link = ''
} = {}) {
  const user = auth.currentUser;
  if (!user || !clean(message)) return null;
  const key = safeKey(`${gameId}_${eventKey || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`}`);
  const notificationRef = doc(db, 'users', user.uid, 'notifications', `game_${key}`);
  try {
    const previous = await getDoc(notificationRef);
    if (previous.exists()) return notificationRef.id;
    await setDoc(notificationRef, {
      title: clean(title) || `${gameTitle} update`,
      message: clean(message), type: clean(type) || 'game', icon: clean(icon) || '🎮',
      link: clean(link) || `${gameId}.html`, read: false, gameId, gameTitle,
      createdAt: serverTimestamp()
    });
    window.dispatchEvent(new CustomEvent('codeacademy-notification', {
      detail: { id: notificationRef.id, title, message, type, icon, link }
    }));
    return notificationRef.id;
  } catch (error) {
    console.warn('Code Academy game notification could not be saved:', error);
    return null;
  }
}

export async function awardGameReward({
  gameId = 'code_academy_game', gameTitle = 'Code Academy game',
  eventKey, xp = 5, coins = 2.5, score = 0, level = 1,
  message = '', icon = '🏆', link = ''
} = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to Code Academy to save game rewards.');
  if (!clean(eventKey)) throw new Error('A unique challenge key is required for this reward.');
  const safeGame = safeKey(gameId);
  const safeEvent = safeKey(eventKey);
  const rewardId = safeKey(`${safeGame}_${safeEvent}`);
  const userRef = doc(db, 'users', user.uid);
  const progressRef = doc(db, 'users', user.uid, 'gameProgress', safeGame);
  const historyRef = doc(db, 'users', user.uid, 'gameHistory', rewardId);
  const notificationRef = doc(db, 'users', user.uid, 'notifications', `game_${rewardId}`);
  const earnedXP = Math.max(0, Math.floor(Number(xp) || 0));
  const earnedCoins = roundCoins(coins);
  const safeMessage = clean(message) || `Challenge completed in ${gameTitle}. You earned ${earnedXP} XP and ${earnedCoins} coins.`;
  const destination = clean(link) || `${safeGame}.html`;

  const result = await runTransaction(db, async tx => {
    const [userSnap, historySnap, progressSnap] = await Promise.all([
      tx.get(userRef), tx.get(historyRef), tx.get(progressRef)
    ]);
    if (!userSnap.exists()) throw new Error('Your Code Academy profile was not found. Sign in again and retry.');
    const profile = userSnap.data() || {};
    const progress = progressSnap.exists() ? progressSnap.data() || {} : {};
    const existingKeys = Array.isArray(progress.completedKeys) ? progress.completedKeys : [];
    const oldXP = Math.max(0, Number(profile.xp) || 0);
    const oldCoins = roundCoins(profile.coins);
    if (historySnap.exists() || existingKeys.includes(safeEvent)) {
      return { awarded: false, xp: oldXP, coins: oldCoins, reason: 'already-awarded' };
    }
    const nextXP = oldXP + earnedXP;
    const nextCoins = roundCoins(oldCoins + earnedCoins);
    const keys = Array.isArray(progress.completedKeys) ? progress.completedKeys : [];
    const nextKeys = [...new Set([...keys, safeEvent])].slice(-250);
    tx.set(userRef, { xp: nextXP, coins: nextCoins }, { merge: true });
    tx.set(progressRef, {
      gameId: safeGame, gameTitle, completedKeys: nextKeys,
      totalXPFromGame: Math.max(0, Number(progress.totalXPFromGame) || 0) + earnedXP,
      totalCoinsFromGame: roundCoins((Number(progress.totalCoinsFromGame) || 0) + earnedCoins),
      challengesCompleted: Math.max(0, Number(progress.challengesCompleted) || 0) + 1,
      lastEventKey: safeEvent, lastScore: Number(score) || 0,
      lastLevel: Number(level) || 1, lastPlayedAt: serverTimestamp(), updatedAt: serverTimestamp()
    }, { merge: true });
    tx.set(historyRef, {
      gameId: safeGame, gameTitle, eventKey: safeEvent, score: Number(score) || 0,
      level: Number(level) || 1, xpDelta: earnedXP, coinsDelta: earnedCoins,
      rewardGranted: true, result: 'completed', createdAt: serverTimestamp()
    });
    tx.set(notificationRef, {
      title: `${gameTitle} reward earned`, message: safeMessage,
      type: 'game', icon: clean(icon) || '🏆', link: destination,
      gameId: safeGame, gameTitle, read: false, createdAt: serverTimestamp()
    });
    return { awarded: true, xp: nextXP, coins: nextCoins, earnedXP, earnedCoins, eventKey: safeEvent };
  });

  window.dispatchEvent(new CustomEvent('codeacademy-game-rewarded', { detail: { gameId: safeGame, gameTitle, ...result } }));
  if (result.awarded) {
    window.dispatchEvent(new CustomEvent('codeacademy-notification', {
      detail: { title: `${gameTitle} reward earned`, message: safeMessage, type: 'game', icon, link: destination }
    }));
  }
  return result;
}

export function initGamePlatform({ gameId, gameTitle, requireAuth = true, link = '' } = {}) {
  const id = safeKey(gameId || 'code_academy_game');
  const title = clean(gameTitle) || 'Code Academy game';
  const pageLink = clean(link) || `${id}.html`;
  if (window.__caGamePlatformInitialised?.[id]) return;
  window.__caGamePlatformInitialised = window.__caGamePlatformInitialised || {};
  window.__caGamePlatformInitialised[id] = true;

  const measure = () => {
    const vv = window.visualViewport;
    const width = Math.max(280, Math.round(vv?.width || window.innerWidth || 360));
    const height = Math.max(320, Math.round(vv?.height || window.innerHeight || 640));
    document.documentElement.style.setProperty('--ca-viewport-width', `${width}px`);
    document.documentElement.style.setProperty('--ca-viewport-height', `${height}px`);
  };
  measure();
  window.addEventListener('resize', measure, { passive: true });
  window.visualViewport?.addEventListener('resize', measure, { passive: true });

  window.CodeAcademyPlatform = {
    award: details => awardGameReward({ gameId: id, gameTitle: title, link: pageLink, ...details }),
    notify: details => recordGameNotification({ gameId: id, gameTitle: title, link: pageLink, ...details }),
    user: () => auth.currentUser
  };

  window.addEventListener('codeacademy-game-reward', event => {
    const detail = event.detail || {};
    awardGameReward({ gameId: id, gameTitle: title, link: pageLink, ...detail })
      .catch(error => console.error(`${title} reward could not be saved:`, error));
  });

  onAuthStateChanged(auth, user => {
    if (!user) {
      if (requireAuth && !window.__caGameLoginRedirected) {
        window.__caGameLoginRedirected = true;
        location.replace('login.html');
      }
      return;
    }
    window.dispatchEvent(new CustomEvent('codeacademy-game-auth-ready', { detail: { user, gameId: id, gameTitle: title } }));
    const day = new Date().toISOString().slice(0, 10);
    recordGameNotification({
      gameId: id, gameTitle: title, eventKey: `opened_${day}`,
      title: `${title} opened`, message: `You opened ${title}. Your account is connected, and completed challenges can update your XP, coins and game history.`,
      type: 'game', icon: '🎮', link: pageLink
    }).catch(error => console.warn('Game-open notification failed:', error));
  });
}
