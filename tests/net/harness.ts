import { ClientSession } from '../../src/net/client';
import { HostSession, type HostOptions } from '../../src/net/host';
import { type LinkConditions, LoopbackNetwork, type LoopbackTransport } from '../../src/net/transport';
import type { PlayerInput } from '../../src/sim/types';
import { emptyInput } from '../../src/sim/types';
import type { PlayerSetup } from '../../src/sim/world';

export const TICK_MS = 1000 / 60;

export const setupFor = (name: string): PlayerSetup => ({ name, race: 'drifter', hat: '', companion: '' });

/** Scripted input for player `who` at local tick `t` (deterministic, exercises run + jump + direction changes). */
export function scripted(t: number, who: number): PlayerInput {
  const inp = emptyInput();
  const phase = (t + who * 37) % 240;
  inp.moveX = phase < 100 ? 1 : phase < 120 ? 0 : phase < 220 ? -1 : 0;
  inp.jump = (t + who * 11) % 70 < 14;
  inp.aimX = 100 + who * 10;
  inp.aimY = 50;
  return inp;
}

export interface Rig {
  net: LoopbackNetwork;
  host: HostSession;
  hostT: LoopbackTransport;
  clients: ClientSession[];
  clientT: LoopbackTransport[];
  /** Local tick counter (drives scripted inputs). */
  t: number;
}

export interface RigOptions {
  seed?: number;
  clients?: number;
  conditions?: Partial<LinkConditions>;
  netSeed?: number;
  host?: Partial<HostOptions>;
}

export function makeRig(opts: RigOptions = {}): Rig {
  const net = new LoopbackNetwork({ seed: opts.netSeed ?? 7, conditions: opts.conditions });
  const hostT = net.join();
  const host = new HostSession({ transport: hostT, seed: opts.seed ?? 42, setups: [setupFor('HOST')], clock: net.clock, ...opts.host });
  const rig: Rig = { net, host, hostT, clients: [], clientT: [], t: 0 };
  for (let i = 0; i < (opts.clients ?? 1); i++) addClient(rig, `P${i + 1}`);
  return rig;
}

export function addClient(rig: Rig, name: string, token?: string): ClientSession {
  const tr = rig.net.join();
  const c = new ClientSession({ transport: tr, setup: setupFor(name), clock: rig.net.clock, host: rig.hostT.selfId, token });
  rig.clients.push(c);
  rig.clientT.push(tr);
  return c;
}

export type InputFn = (t: number, who: number) => PlayerInput;

/** Advance everything by one tick: host step, client steps, network delivery. */
export function step(rig: Rig, hostInput: InputFn | null = scripted, clientInput: InputFn | null = scripted): void {
  const t = rig.t++;
  rig.host.tick(new Map([[0, hostInput ? hostInput(t, 0) : emptyInput()]]));
  rig.host.drainEvents();
  rig.clients.forEach((c, i) => {
    if (c.state !== 'joined' && c.state !== 'connecting') return;
    const idx = c.playerIndex >= 0 ? c.playerIndex : 0;
    c.tick(new Map([[idx, clientInput ? clientInput(t, i + 1) : emptyInput()]]));
    c.drainEvents();
  });
  rig.net.advance(TICK_MS);
}

export function run(rig: Rig, ticks: number, hostInput: InputFn | null = scripted, clientInput: InputFn | null = scripted): void {
  for (let i = 0; i < ticks; i++) step(rig, hostInput, clientInput);
}

export const idle: InputFn = () => emptyInput();
