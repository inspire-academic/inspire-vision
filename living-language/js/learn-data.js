/* Learn Klo — content schemas + seed data for the lesson system.
   Companion to /living-language/js/data.js (which holds the archive's
   Speaker/Recording/LanguageEntry/Story/FamilyArchive types). This file
   is scoped to the learning system's own schemas per the Krobo Learn
   handoff brief: AlphabetItem, VocabularyItem, Lesson, Conversation.

   ══════════════════════════════════════════════════════════════════
   READ BEFORE ADDING CONTENT — same discipline as data.js, stated more
   strictly here because this is exactly where the project's non-
   negotiable was violated once already (see living-language/README.md,
   "Earlier build mistake, corrected"):

     Do NOT invent Krobo words, spellings, or pronunciation — not even
     as a "clearly labelled placeholder" that looks like a real word.
     A placeholder must look like a placeholder (empty string / null /
     an honest "in preparation" state), never a plausible-sounding
     invented form.

   The alphabet LETTER SHAPES below (A, B, D, E, Ɛ, GB, KP, NG, NGM...)
   are safe to seed verbatim — they were supplied directly in the Learn
   Klo handoff brief as "the current working sequence to support in
   design," not invented here. Everything downstream of each letter
   (its name, its sound, any audio) stays blank/draft until a native
   speaker and orthography review confirm it.

   The vocabulary categories below (home, family, food, ...) are seeded
   with ENGLISH concepts only — english_meaning is populated because
   that's just naming what a lesson is about; klo_written_form and all
   audio fields stay empty. Two specific words this brief's own planning
   notes floated ("Chimi" for calabash, "Kopo" for cup) are explicitly
   called out in the brief as unverified chatter that must NOT be
   published as fact — so they are deliberately absent here, not merely
   marked draft.
   ══════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const VERIFICATION_STATUS = Object.freeze({
    DRAFT: 'draft',
    NATIVE_CHECKED: 'native_checked',
    ORTHOGRAPHY_CHECKED: 'orthography_checked',
    APPROVED: 'approved',
    DEPRECATED: 'deprecated'
  });

  /**
   * @typedef {Object} AlphabetItem
   * @property {string} id
   * @property {string} uppercase
   * @property {string} lowercase
   * @property {number} sortOrder
   * @property {string} letterName            empty until verified
   * @property {string|null} letterNameAudio
   * @property {string} soundDescription      empty until verified
   * @property {string|null} letterSoundAudio
   * @property {string|null} exampleWordId
   * @property {keyof VERIFICATION_STATUS} verificationStatus
   */

  // The 30-item working sequence supplied in the Learn Klo handoff brief.
  // Order and inventory must be checked against approved linguistic
  // sources before public release — see CONTENT-GAP-REPORT.md.
  const ALPHABET_SEQUENCE = ['A','B','D','E','Ɛ','F','G','GB','H','I','J','K','KP','L','M','N','NG','NGM','NY','O','Ɔ','P','S','T','TS','U','V','W','Y','Z'];

  const ALPHABET = ALPHABET_SEQUENCE.map((letter, i) => ({
    id: 'alphabet_' + letter.toLowerCase(),
    uppercase: letter,
    lowercase: letter.toLowerCase(),
    sortOrder: i + 1,
    letterName: '',
    letterNameAudio: null,
    soundDescription: '',
    letterSoundAudio: null,
    exampleWordId: null,
    verificationStatus: VERIFICATION_STATUS.DRAFT
  }));

  /**
   * @typedef {Object} VocabularyItem
   * @property {string} id
   * @property {string} englishMeaning
   * @property {string} standardWrittenForm   empty until verified
   * @property {string} kloWrittenForm        empty until verified
   * @property {string[]} alternateForms
   * @property {string} partOfSpeech
   * @property {string} category
   * @property {string|null} imageAsset
   * @property {string|null} audioNatural
   * @property {string|null} audioSlow
   * @property {string|null} speakerId
   * @property {string} speakerLocality
   * @property {string} dialectNote
   * @property {string} exampleSentence
   * @property {string} exampleSentenceTranslation
   * @property {string|null} exampleSentenceAudio
   * @property {string} culturalNote
   * @property {keyof VERIFICATION_STATUS} verificationStatus
   * @property {string[]} verifiedBy
   * @property {string} sourceNote
   */

  function vocab(id, englishMeaning, category, partOfSpeech) {
    return {
      id, englishMeaning, category, partOfSpeech: partOfSpeech || 'noun',
      standardWrittenForm: '', kloWrittenForm: '', alternateForms: [],
      imageAsset: null, audioNatural: null, audioSlow: null,
      speakerId: null, speakerLocality: '', dialectNote: '',
      exampleSentence: '', exampleSentenceTranslation: '', exampleSentenceAudio: null,
      culturalNote: '', verificationStatus: VERIFICATION_STATUS.DRAFT,
      verifiedBy: [], sourceNote: 'Concept seeded from Learn Klo handoff brief; Krobo form not yet collected.'
    };
  }

  const VOCABULARY = [
    // Things in My Home
    vocab('voc_home_cup', 'Cup', 'home'),
    vocab('voc_home_calabash', 'Calabash', 'home'),
    vocab('voc_home_pot', 'Pot', 'home'),
    vocab('voc_home_spoon', 'Spoon', 'home'),
    vocab('voc_home_chair', 'Chair', 'home'),
    vocab('voc_home_bed', 'Bed', 'home'),
    vocab('voc_home_door', 'Door', 'home'),
    vocab('voc_home_broom', 'Broom', 'home'),
    vocab('voc_home_basket', 'Basket', 'home'),
    // My Family
    vocab('voc_family_mother', 'Mother', 'family'),
    vocab('voc_family_father', 'Father', 'family'),
    vocab('voc_family_grandmother', 'Grandmother', 'family'),
    vocab('voc_family_grandfather', 'Grandfather', 'family'),
    vocab('voc_family_child', 'Child', 'family'),
    vocab('voc_family_boy', 'Boy', 'family'),
    vocab('voc_family_girl', 'Girl', 'family'),
    vocab('voc_family_friend', 'Friend', 'family'),
    // Food
    vocab('voc_food_water', 'Water', 'food'),
    vocab('voc_food_yam', 'Yam', 'food'),
    vocab('voc_food_fish', 'Fish', 'food'),
    vocab('voc_food_pepper', 'Pepper', 'food'),
    vocab('voc_food_maize', 'Maize', 'food'),
    vocab('voc_food_soup', 'Soup', 'food'),
    vocab('voc_food_meat', 'Meat', 'food'),
    vocab('voc_food_egg', 'Egg', 'food'),
    // Numbers (concept only — no digits/words invented)
    vocab('voc_num_1', 'One', 'numbers'), vocab('voc_num_2', 'Two', 'numbers'),
    vocab('voc_num_3', 'Three', 'numbers'), vocab('voc_num_4', 'Four', 'numbers'),
    vocab('voc_num_5', 'Five', 'numbers'), vocab('voc_num_6', 'Six', 'numbers'),
    vocab('voc_num_7', 'Seven', 'numbers'), vocab('voc_num_8', 'Eight', 'numbers'),
    vocab('voc_num_9', 'Nine', 'numbers'), vocab('voc_num_10', 'Ten', 'numbers'),
    // Colours
    vocab('voc_colour_red', 'Red', 'colours', 'adjective'),
    vocab('voc_colour_blue', 'Blue', 'colours', 'adjective'),
    vocab('voc_colour_white', 'White', 'colours', 'adjective'),
    vocab('voc_colour_black', 'Black', 'colours', 'adjective'),
    vocab('voc_colour_green', 'Green', 'colours', 'adjective'),
    vocab('voc_colour_yellow', 'Yellow', 'colours', 'adjective'),
    // Greetings & everyday expressions
    vocab('voc_greet_hello', 'Greeting / hello', 'greetings', 'phrase'),
    vocab('voc_greet_good_morning', 'Good morning', 'greetings', 'phrase'),
    vocab('voc_greet_how_are_you', 'How are you?', 'greetings', 'phrase'),
    vocab('voc_greet_i_am_well', 'I am well', 'greetings', 'phrase'),
    vocab('voc_greet_what_is_your_name', 'What is your name?', 'greetings', 'phrase'),
    vocab('voc_greet_my_name_is', 'My name is...', 'greetings', 'phrase'),
    vocab('voc_greet_thank_you', 'Thank you', 'greetings', 'phrase'),
    vocab('voc_greet_please', 'Please', 'greetings', 'phrase'),
    vocab('voc_greet_welcome', 'Welcome', 'greetings', 'phrase'),
    vocab('voc_greet_goodbye', 'Goodbye', 'greetings', 'phrase')
  ];

  /**
   * @typedef {Object} Lesson
   * @property {string} id
   * @property {string} title
   * @property {string} slug
   * @property {number} level
   * @property {number} sequence
   * @property {string} lessonType   alphabet | see_and_say | listen_and_find | hear_it_choose_it | conversation | verified_phrase
   * @property {string[]} learnerModes
   * @property {number} estimatedMinutes
   * @property {string} introText
   * @property {string} description
   * @property {string[]} itemIds     alphabet or vocabulary ids this lesson draws on
   * @property {boolean} published
   */

  const LESSONS = [
    {
      id: 'lesson_alphabet', title: 'Meet the Krobo Alphabet', slug: 'alphabet',
      level: 1, sequence: 1, lessonType: 'alphabet', learnerModes: ['young', 'adult'],
      estimatedMinutes: 8, introText: 'Learn the basic written forms and hear authentic Klo pronunciation.',
      description: 'Letters & Sounds', itemIds: ALPHABET.map(a => a.id), published: true
    },
    {
      id: 'lesson_home', title: 'Things in My Home', slug: 'things-in-my-home',
      level: 1, sequence: 2, lessonType: 'see_and_say', learnerModes: ['young', 'adult'],
      estimatedMinutes: 6, introText: 'Connect everyday objects around the house to their Krobo names.',
      description: 'See & Say', itemIds: VOCABULARY.filter(v => v.category === 'home').map(v => v.id), published: true
    },
    {
      id: 'lesson_family', title: 'My Family', slug: 'my-family',
      level: 1, sequence: 3, lessonType: 'see_and_say', learnerModes: ['young', 'adult'],
      estimatedMinutes: 6, introText: 'Learn the words for the people closest to you.',
      description: 'See & Say', itemIds: VOCABULARY.filter(v => v.category === 'family').map(v => v.id), published: true
    },
    {
      id: 'lesson_food', title: 'Food', slug: 'food',
      level: 1, sequence: 4, lessonType: 'see_and_say', learnerModes: ['young', 'adult'],
      estimatedMinutes: 6, introText: 'Everyday foods from a Krobo table.',
      description: 'See & Say', itemIds: VOCABULARY.filter(v => v.category === 'food').map(v => v.id), published: true
    },
    {
      id: 'lesson_listen_find', title: 'Listen & Find', slug: 'listen-and-find',
      level: 1, sequence: 5, lessonType: 'listen_and_find', learnerModes: ['young', 'adult'],
      estimatedMinutes: 5, introText: 'Train your ear — hear a word and find the picture it belongs to.',
      description: 'Listening practice', itemIds: VOCABULARY.filter(v => ['home', 'family', 'food'].includes(v.category)).slice(0, 8).map(v => v.id), published: true
    },
    {
      id: 'lesson_numbers_colours', title: 'Numbers & Colours', slug: 'numbers-and-colours',
      level: 1, sequence: 6, lessonType: 'see_and_say', learnerModes: ['young', 'adult'],
      estimatedMinutes: 7, introText: 'Count and describe the world around you.',
      description: 'See & Say', itemIds: VOCABULARY.filter(v => ['numbers', 'colours'].includes(v.category)).map(v => v.id), published: true
    },
    {
      id: 'lesson_greetings', title: 'Greetings & Everyday Expressions', slug: 'greetings',
      level: 2, sequence: 7, lessonType: 'see_and_say', learnerModes: ['young', 'adult'],
      estimatedMinutes: 6, introText: 'The first words exchanged between two Krobo speakers.',
      description: 'See & Say', itemIds: VOCABULARY.filter(v => v.category === 'greetings').map(v => v.id), published: true
    },
    {
      id: 'lesson_first_conversation', title: 'My First Krobo Conversation', slug: 'first-conversation',
      level: 2, sequence: 8, lessonType: 'conversation', learnerModes: ['young', 'adult'],
      estimatedMinutes: 5, introText: 'Put greetings together into a short exchange.',
      description: 'Conversation', itemIds: VOCABULARY.filter(v => v.category === 'greetings').slice(0, 4).map(v => v.id), published: true
    },
    // Bonus: the one fully real, verified lesson — kept from the original
    // sample build. Uses its own step engine (see learn-engine.js
    // renderVerifiedPhrase) rather than the generic vocabulary types above,
    // since it isn't built from VOCABULARY/ALPHABET items.
    {
      id: 'lesson_founding_phrase', title: 'The Founding Phrase', slug: 'founding-phrase',
      level: 1, sequence: 0, lessonType: 'verified_phrase', learnerModes: ['young', 'adult'],
      estimatedMinutes: 3, introText: 'The one Krobo sentence verified at this project’s founding — hear it, spot its special character, and rebuild it.',
      description: 'Verified & real', itemIds: [], published: true
    }
  ];

  global.LivingLanguageLearn = {
    VERIFICATION_STATUS,
    alphabet: ALPHABET,
    vocabulary: VOCABULARY,
    lessons: LESSONS,
    getLesson: (slug) => LESSONS.find(l => l.slug === slug),
    getVocabularyById: (id) => VOCABULARY.find(v => v.id === id),
    getAlphabetById: (id) => ALPHABET.find(a => a.id === id)
  };
})(window);
