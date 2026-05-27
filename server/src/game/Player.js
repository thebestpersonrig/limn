export const MAX_GUESSES = 5;

export class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.score = 0;
    this.isDrawing = false;
    this.hasGuessedCorrectly = false;
    this.guessesUsed = 0;
  }

  get guessesLeft() {
    return MAX_GUESSES - this.guessesUsed;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      score: this.score,
      isDrawing: this.isDrawing,
      hasGuessedCorrectly: this.hasGuessedCorrectly,
      guessesUsed: this.guessesUsed,
      guessesLeft: this.guessesLeft,
    };
  }
}
