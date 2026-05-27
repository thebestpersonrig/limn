export const wordsByDifficulty = {
  easy: [
    // Shapes & symbols
    "heart", "star", "circle", "arrow", "smiley face", "sad face", "eye",
    "thumbs up", "peace sign", "cross", "skull",

    // Weather & sky
    "sun", "moon", "cloud", "rain", "snowflake", "snowman", "rainbow", "lightning",

    // Simple nature
    "tree", "flower", "leaf", "grass", "wave", "mountain",

    // Simple food
    "pizza", "donut", "apple", "banana", "egg", "bread", "ice cream", "lollipop",
    "cake", "watermelon", "cherry",

    // Simple animals
    "fish", "cat", "dog", "duck", "rabbit", "frog", "bee", "snake", "ant",

    // Everyday objects
    "car", "bus", "house", "door", "window", "cup", "plate", "spoon", "fork",
    "knife", "bowl", "bottle", "bag", "shoe", "hat", "glasses", "book",
    "phone", "ball", "balloon", "flag", "candle", "key", "clock", "pencil",
    "chair", "table", "bed", "lamp", "umbrella", "ladder", "broom",
    "mirror", "sock", "glove", "ring", "envelope", "coin",
  ],

  medium: [
    // Symbols
    "crown", "diamond", "lightning bolt", "shooting star", "crescent moon",

    // Nature
    "cactus", "mushroom", "volcano", "island", "campfire", "sunset",

    // Food
    "burger", "hot dog", "taco", "fries", "pretzel", "cupcake", "popsicle",
    "candy cane", "sushi",

    // Animals
    "butterfly", "penguin", "flamingo", "swan", "turtle", "crab", "snail",

    // Vehicles
    "boat", "plane", "bicycle", "rocket", "sailboat", "submarine",

    // Objects
    "guitar", "drum", "trumpet", "microphone", "camera", "lightbulb",
    "scissors", "hammer", "wrench", "anchor", "kite", "gift box",
    "trophy", "medal", "sword", "shield", "bomb", "ghost", "robot", "alien",
    "trash can", "bucket", "mailbox", "fence", "traffic light", "stop sign",
    "bowtie", "boot", "toothbrush", "comb", "thermometer", "magnet",
    "ruler", "paintbrush", "headphones", "lantern", "telescope",
  ],

  hard: [
    // Symbols & concepts
    "spiral", "hourglass", "compass", "target", "black hole",

    // Nature
    "tornado", "whirlpool", "glacier",

    // Food
    "croissant", "dumpling", "macaron",

    // Animals
    "octopus", "jellyfish", "starfish", "spider", "scorpion", "chameleon",

    // Vehicles
    "hot air balloon", "spaceship", "ufo",

    // Fantasy
    "dragon", "unicorn", "wizard hat", "magic wand", "spaceship",
    "treasure chest", "cannon",

    // Objects
    "magnifying glass", "hourglass", "microscope", "binoculars",
    "syringe", "compass", "abacus", "gramophone", "periscope",
  ],
};

// Returns [easyWord, mediumWord, hardWord]
export function getRandomWords() {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // Pick without repeating across the three
  const easy = pick(wordsByDifficulty.easy);
  const medium = pick(wordsByDifficulty.medium);
  const hard = pick(wordsByDifficulty.hard);

  return [easy, medium, hard];
}
