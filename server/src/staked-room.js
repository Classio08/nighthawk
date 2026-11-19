// A match where every human puts the same play-money stake in escrow. Same rules and same sim as a normal match (it IS a MatchRoom); the differences:
//   - you must be signed in with a wallet (token from /economy/wallet/verify) and the gate must allow wagering
//   - stakes lock when you join; leaving before the match starts refunds; leaving after forfeits
//   - fewer than two stakers when the lobby ends, or any error: everybody is refunded
//   - the winner is decided by the SERVER from the finished sim: the best placement among stakers who stayed to the end (ServerEconomy.onOver)
import { ServerError } from '@colyseus/core';
import { MatchRoom } from './MatchRoom.js';

export function makeStakedRoom(se) {
  return class StakedMatchRoom extends MatchRoom {
    onCreate(options) {
      super.onCreate();
      this.stake = options?.stake; this.stakers = new Map(); this.lobbyLeft = this.cfg.stakedLobbySecs ?? 30;
      try { se.economy.wagerOpen({ id: this.roomId, stake: options?.stake, maxPlayers: this.cfg.maxClients }); }
      catch (e) { MatchRoom.instances.delete(this); throw new ServerError(403, e.message); }
    }

    onAuth(client, options) {
      const addr = se.identify(options?.wallet);
      if (!addr) throw new ServerError(401, 'sign in with your wallet first');
      if (options?.stake !== this.stake) throw new ServerError(400, 'stake mismatch');
      return { addr };
    }

    onJoin(client, options) {
      const addr = client.auth.addr;
      try { se.economy.wagerJoin(this.roomId, addr); } catch (e) { throw new ServerError(403, e.message); }
      this.stakers.set(client.sessionId, addr); se.saveSoon();
      super.onJoin(client, { ...options, wallet: options.wallet });
    }

    onLeave(client, code) {
      const addr = this.stakers.get(client.sessionId);
      if (addr && !this.sim) { try { se.economy.wagerLeave(this.roomId, addr); } catch { /* already refunded */ } this.stakers.delete(client.sessionId); se.saveSoon(); }
      super.onLeave(client, code);
    }

    async _start() {
      if (this.sim || this.starting) return;
      try {
        if (this.stakers.size < 2) throw new Error('not enough players');
        se.economy.wagerStart(this.roomId);
      } catch (e) {
        this.starting = true; try { se.economy.wagerVoid(this.roomId, e.message); } catch { /* ignore */ }
        this.broadcast('wagervoid', { reason: e.message }); se.saveSoon(); this.clock.setTimeout(() => this.disconnect(), 500); return;
      }
      return super._start();
    }

    onDispose() { try { se.economy.wagerVoid(this.roomId, 'room-closed'); } catch { /* unknown or already settled */ } se.saveSoon(); super.onDispose(); }
  };
}
