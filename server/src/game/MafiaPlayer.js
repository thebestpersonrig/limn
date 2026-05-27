export class MafiaPlayer {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.role = null;           // "civilian" | "mafia" | "detective" | "doctor"
    this.isAlive = true;
    this.votedFor = null;       // target id during vote phase
    this.nightTarget = null;    // target id during night phase
    this.lastChatTime = 0;      // timestamp for slowmode
  }

  toJSON(revealRole = false) {
    return {
      id: this.id,
      name: this.name,
      isAlive: this.isAlive,
      role: revealRole || !this.isAlive ? this.role : null,
    };
  }
}
