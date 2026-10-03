/**
 * Netcode public API (see server/README.md for how hosting works and how to wire a lobby).
 *
 *   Host:   new HostSession({ transport, seed, setups: [mySetup] })
 *   Client: new ClientSession({ transport, setup: mySetup })
 *   Transports: joinTrysteroRoom (P2P), connectWebSocket / WebSocketServerTransport (dedicated / relay),
 *               LoopbackNetwork (tests, local simulation of latency/jitter/loss).
 */
export { ClientSession, type ClientOptions, type ClientState, type ClientStats } from './client';
export { HostSession, DEFAULT_INTEREST, type HostOptions, type HostClientStats } from './host';
export { PROTOCOL_VERSION } from './protocol';
export { LoopbackNetwork, LoopbackTransport, type Channel, type LinkConditions, type PeerId, type Transport, type TransportStats } from './transport';
export { joinTrysteroRoom, makeRoomCode, normalizeRoomCode, TrysteroTransport, type TrysteroOptions } from './trysteroTransport';
export { connectWebSocket, WebSocketClientTransport, WebSocketServerTransport, type WebSocketLike } from './wsTransport';
