/* The Living Language Project — corpus/content type definitions + seed data.
   Kept deliberately separate from every page's UI code (repository/service-
   layer pattern per the founding architecture brief): pages read from
   LivingLanguage.* below rather than hardcoding speaker/lesson content
   inline, so a real backend can replace this file later without touching
   any page markup.

   VERIFICATION DISCIPLINE — do not add to this file casually:
   Only "Wɔ tsuo wa ngɛ saminya ngɛ Mawu biɛm." is an explicitly supplied,
   verified Krobo phrase. Every other Krobo string below is either (a)
   sourced from that one phrase, or (b) marked pending: true and MUST also
   carry a pendingNote. Nothing here may be presented publicly as
   authoritative Krobo beyond that one verified phrase. Do not extrapolate
   new translations — see /living-language/README.md.

   All speaker/recording/story content below is clearly seed/demo data for
   the MVP vertical slice, not real contributor submissions.

   COMMUNITY CORPUS CATEGORIES (added for the Muo ni / Abɛ / Folk Songs /
   Folk Tales build — see /living-language/community/): these are four
   thematic destinations layered on top of the existing content-type list
   below, not a new data model. Krobo-name status per category, so nobody
   downstream mistakes "supplied" for "confirmed":
     - Muo ni (funny sayings/wit)     — Krobo name supplied by founder, no caveat.
     - Abɛ (proverbs)                 — Krobo name supplied by founder, but the
                                         exact spelling is explicitly PENDING
                                         Krobo Language & Culture Council
                                         confirmation. Every page showing "Abɛ"
                                         must carry that pending note — do not
                                         drop it just because the word looks
                                         confirmed elsewhere in this file.
     - Folk Songs, Dirges & Chants    — no Krobo name supplied yet. Ships in
                                         English with a community "help us name
                                         this" callout (see community.js).
     - Folk Tales                     — same as above: English + naming callout.
   None of these four categories may ever be seeded with example Krobo
   proverbs, sayings, song lyrics or tale text — they launch empty and only
   fill from real reviewed community submissions. */

(function (global) {
  'use strict';

  // ── Enums (architecture brief §Verification states / Access levels) ──
  const VERIFICATION_STATUS = Object.freeze({
    VERIFIED: 'VERIFIED',
    VALID_COMMUNITY_VARIANT: 'VALID_COMMUNITY_VARIANT',
    HISTORICAL_OR_SPECIALIST: 'HISTORICAL_OR_SPECIALIST',
    PENDING_REVIEW: 'PENDING_REVIEW',
    REJECTED: 'REJECTED'
  });

  const ACCESS_LEVEL = Object.freeze({
    PUBLIC: 'PUBLIC',
    COMMUNITY: 'COMMUNITY',
    FAMILY_ONLY: 'FAMILY_ONLY',
    RESEARCH_WITH_PERMISSION: 'RESEARCH_WITH_PERMISSION',
    ARCHIVE_ONLY: 'ARCHIVE_ONLY'
  });

  const VARIANT = Object.freeze({
    MANYA: 'Manya',
    YILO: 'Yilo',
    OTHER: 'Other',
    UNSURE: 'Unsure'
  });

  /**
   * @typedef {Object} Speaker
   * @property {string} id
   * @property {string} displayName
   * @property {string} [preferredName]
   * @property {number} [birthYearApprox]
   * @property {string} community
   * @property {'Manya'|'Yilo'|'Other'|'Unsure'} variant
   * @property {string} biography
   * @property {string} image
   * @property {'pending'|'given'} consentStatus
   * @property {'PUBLIC'|'COMMUNITY'|'FAMILY_ONLY'|'RESEARCH_WITH_PERMISSION'|'ARCHIVE_ONLY'} visibility
   * @property {boolean} technologyUsePermitted
   * @property {boolean} syntheticVoicePermitted
   * @property {{stories:number, phrases:number, proverbs:number}} counts
   * @property {string} createdAt
   */

  /**
   * @typedef {Object} Recording
   * @property {string} id
   * @property {string} speakerId
   * @property {string} title
   * @property {string} recordingType  word|phrase|proverb|story|song|prayer|memory|cultural_explanation|other
   * @property {string} [audioUrl]
   * @property {number} [durationSeconds]
   * @property {string} [transcriptionKrobo]
   * @property {string} [translationEnglish]
   * @property {string} community
   * @property {'Manya'|'Yilo'|'Other'|'Unsure'} variant
   * @property {string} [culturalNotes]
   * @property {keyof ACCESS_LEVEL} accessLevel
   * @property {string} rightsStatus
   * @property {keyof VERIFICATION_STATUS} verificationStatus
   * @property {boolean} pending
   * @property {string} [pendingNote]
   * @property {string} createdAt
   */

  /**
   * @typedef {Object} LanguageEntry
   * @property {string} id
   * @property {string} canonicalForm
   * @property {string[]} alternateForms
   * @property {string} meaning
   * @property {string} [literalMeaning]
   * @property {string} partOfSpeech
   * @property {'Manya'|'Yilo'|'Other'|'Unsure'} variant
   * @property {string} [pronunciationAudio]
   * @property {string} [exampleSentence]
   * @property {string} [exampleTranslation]
   * @property {string} [culturalContext]
   * @property {string} source
   * @property {string} contributor
   * @property {string} [verifier]
   * @property {keyof VERIFICATION_STATUS} verificationStatus
   * @property {keyof ACCESS_LEVEL} accessRights
   * @property {boolean} technologyUsePermitted
   * @property {string[]} curriculumTags
   * @property {'beginner'|'intermediate'|'advanced'} difficulty
   * @property {boolean} pending
   * @property {string} [pendingNote]
   */

  /**
   * @typedef {Object} Story
   * @property {string} id
   * @property {string} speakerId
   * @property {string} title
   * @property {string} [audioUrl]
   * @property {string} [transcription]
   * @property {string} [translation]
   * @property {string[]} vocabularyRefs
   * @property {string} [culturalNotes]
   * @property {string[]} ageTags
   * @property {keyof ACCESS_LEVEL} accessLevel
   */

  /**
   * @typedef {Object} Lesson
   * @property {string} id
   * @property {string} title
   * @property {number} level
   * @property {string} unit
   * @property {string[]} objectives
   * @property {Array<Object>} contentItems
   * @property {string[]} sourceLanguageEntries
   * @property {string[]} sourceRecordings
   * @property {'draft'|'published'} publicationStatus
   */

  /**
   * @typedef {Object} FamilyArchive
   * @property {string} id
   * @property {string} familyId
   * @property {string[]} memberIds
   * @property {string[]} recordingIds
   * @property {{visibility:string, sharedWithLearners:boolean}} accessRules
   */

  // ── Seed: Speakers (demo data — clearly not real contributors yet) ──
  const SEED_SPEAKERS = [
    {
      id: 'spk-akosua',
      displayName: 'Grandma Dade Ayongo',
      preferredName: 'Dade',
      birthYearApprox: 1948,
      community: 'Somanya',
      variant: VARIANT.MANYA,
      biography: 'A retired trader and grandmother of nine, Grandma Dade Ayongo has spent decades passing on Krobo proverbs and market greetings to the children of her compound in Somanya.',
      image: '/assets/images/living-language/portrait-elder-woman.jpg',
      consentStatus: 'given',
      visibility: ACCESS_LEVEL.PUBLIC,
      technologyUsePermitted: true,
      syntheticVoicePermitted: false,
      counts: { stories: 18, phrases: 46, proverbs: 12 },
      createdAt: '2026-07-14'
    },
    {
      id: 'spk-nene-tetteh',
      displayName: 'Maa Yowɛ',
      community: 'Somanya',
      variant: VARIANT.MANYA,
      biography: 'A respected elder and campaign supporter of 100 Voices of Krobo, Maa Yowɛ has offered her childhood memories and family names for preservation.',
      image: '/assets/images/living-language/portrait-somanya-elder.jpg',
      consentStatus: 'given',
      visibility: ACCESS_LEVEL.PUBLIC,
      technologyUsePermitted: true,
      syntheticVoicePermitted: false,
      counts: { stories: 6, phrases: 21, proverbs: 4 },
      createdAt: '2026-07-20'
    },
    {
      id: 'spk-odumase-leader',
      displayName: 'Nene Odonkor',
      community: 'Odumase-Krobo',
      variant: VARIANT.YILO,
      biography: 'A traditional leader from Odumase-Krobo, recorded as part of the founding corridor launch — speaking on custom, greeting etiquette and the role of elders in language transmission.',
      image: '/assets/images/living-language/portrait-odumase-traditional-leader.jpg',
      consentStatus: 'given',
      visibility: ACCESS_LEVEL.PUBLIC,
      technologyUsePermitted: true,
      syntheticVoicePermitted: false,
      counts: { stories: 9, phrases: 15, proverbs: 8 },
      createdAt: '2026-08-02'
    },
    {
      id: 'spk-family-only-1',
      displayName: 'Grandpa Nartey',
      community: 'Odumase-Krobo',
      variant: VARIANT.YILO,
      biography: 'Recordings preserved by his family for private, in-family learning only — not shared to the public gallery.',
      image: '/assets/images/living-language/elder-interview-recording.jpg',
      consentStatus: 'given',
      visibility: ACCESS_LEVEL.FAMILY_ONLY,
      technologyUsePermitted: false,
      syntheticVoicePermitted: false,
      counts: { stories: 4, phrases: 9, proverbs: 2 },
      createdAt: '2026-08-10'
    }
  ];

  // ── Seed: the one explicitly supplied, verified phrase ──
  const VERIFIED_SEED_PHRASE = {
    krobo: 'Wɔ tsuo wa ngɛ saminya ngɛ Mawu biɛm.',
    // English rendering intentionally omitted from public display copy
    // pending language-authority sign-off — see README §Open verification items.
    note: 'The only Krobo sentence in this build supplied and confirmed by project founders. Every other Krobo string in this seed file is derived only from this phrase or is explicitly marked pending.'
  };

  const SEED_LANGUAGE_ENTRIES = [
    {
      id: 'le-founding-phrase',
      canonicalForm: VERIFIED_SEED_PHRASE.krobo,
      alternateForms: [],
      meaning: '[meaning pending public release — verified internally, translation copy pending Language Council review]',
      literalMeaning: null,
      partOfSpeech: 'sentence',
      variant: VARIANT.MANYA,
      pronunciationAudio: null,
      exampleSentence: null,
      exampleTranslation: null,
      culturalContext: 'The founding phrase supplied at project inception.',
      source: 'Project founding documentation',
      contributor: 'Founders',
      verifier: null,
      verificationStatus: VERIFICATION_STATUS.VERIFIED,
      accessRights: ACCESS_LEVEL.PUBLIC,
      technologyUsePermitted: true,
      curriculumTags: ['founding'],
      difficulty: 'intermediate',
      pending: false
    }
  ];

  const SEED_STORIES = [
    {
      id: 'story-akosua-market',
      speakerId: 'spk-akosua',
      title: 'The Morning I First Went to Market',
      audioUrl: null,
      transcription: null,
      translation: null,
      vocabularyRefs: [],
      culturalNotes: 'A childhood memory recorded as part of the 100 Voices campaign; transcription pending language-team review.',
      ageTags: ['all-ages'],
      accessLevel: ACCESS_LEVEL.PUBLIC
    }
  ];

  // This sample lesson deliberately builds on ONLY the one phrase explicitly
  // supplied and verified at project founding. It never states or implies a
  // meaning for that phrase — the founding team has withheld the English
  // gloss pending Language Council sign-off, and this build does not
  // extrapolate one. The "spot the character" step is answerable purely by
  // looking at the supplied Krobo text (ɔ visibly appears in it); it invents
  // nothing. Once the verified corpus grows, real "select the meaning" /
  // multi-phrase units can be built the same way, from real reviewed entries.
  const SEED_LESSONS = [
    {
      id: 'lesson-hear-krobo-1',
      title: 'Hear Krobo: The Founding Phrase',
      level: 1,
      unit: 'Hear Krobo',
      objectives: ['Recognise the special character ɔ', 'Hear the rhythm of a real recorded Krobo sentence', 'Practice rebuilding the sentence in order'],
      contentItems: [
        { type: 'listen', targetEntry: 'le-founding-phrase' },
        { type: 'spot-character', targetEntry: 'le-founding-phrase', prompt: 'Which special character appears in this phrase?', options: ['ɔ', 'ŋ', 'ʒ'], correct: 'ɔ' },
        { type: 'reorder-sentence', targetEntry: 'le-founding-phrase', tokens: ['Wɔ', 'tsuo', 'wa', 'ngɛ', 'saminya', 'ngɛ', 'Mawu', 'biɛm.'] }
      ],
      sourceLanguageEntries: ['le-founding-phrase'],
      sourceRecordings: [],
      publicationStatus: 'published'
    }
  ];

  const SEED_FAMILY_ARCHIVES = [
    {
      id: 'fam-nartey',
      familyId: 'family-nartey',
      memberIds: ['spk-family-only-1'],
      recordingIds: [],
      accessRules: { visibility: ACCESS_LEVEL.FAMILY_ONLY, sharedWithLearners: false }
    }
  ];

  global.LivingLanguage = {
    VERIFICATION_STATUS,
    ACCESS_LEVEL,
    VARIANT,
    VERIFIED_SEED_PHRASE,
    speakers: SEED_SPEAKERS,
    languageEntries: SEED_LANGUAGE_ENTRIES,
    stories: SEED_STORIES,
    lessons: SEED_LESSONS,
    familyArchives: SEED_FAMILY_ARCHIVES,
    // Only PUBLIC/COMMUNITY visibility speakers may render in public browse views.
    publicSpeakers: SEED_SPEAKERS.filter(s => s.visibility === ACCESS_LEVEL.PUBLIC || s.visibility === ACCESS_LEVEL.COMMUNITY)
  };
})(window);
