export class MonopolyPlayer {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.money = 1500;
    this.position = 0;
    this.properties = [];        // array of board indices owned
    this.houses = new Map();     // propertyIndex → count (1-4 = houses, 5 = hotel)
    this.mortgaged = new Set();  // set of mortgaged property indices
    this.inJail = false;
    this.jailTurns = 0;
    this.getOutOfJailCards = 0;
    this.isBankrupt = false;
    this.doublesCount = 0;
    this.hasRolled = false;      // has rolled this turn
  }

  netWorth(board) {
    let total = this.money;
    for (const idx of this.properties) {
      const space = board[idx];
      if (this.mortgaged.has(idx)) {
        total += space.mortgageValue || 0;
      } else {
        total += space.price || 0;
      }
      const h = this.houses.get(idx) || 0;
      if (h > 0 && space.houseCost) {
        total += h * (space.houseCost / 2); // houses sell at half
      }
    }
    return total;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      money: this.money,
      position: this.position,
      properties: this.properties,
      houses: Object.fromEntries(this.houses),
      mortgaged: [...this.mortgaged],
      inJail: this.inJail,
      jailTurns: this.jailTurns,
      getOutOfJailCards: this.getOutOfJailCards,
      isBankrupt: this.isBankrupt,
    };
  }
}
