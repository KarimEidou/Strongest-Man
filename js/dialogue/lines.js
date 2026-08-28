// Canned dialogue corpus. Structure: LINES[situation][band]. The game is fully
// voiced by these with no API key; Groq responses only add variety on top.
//
// The bands used to be karma bands — the city's running opinion of you — and
// there is no such thing any more. Every lookup now comes in on 'neutral', so
// that is the only band left with its own pool, and everything else answers on
// 'any'. The shape is kept rather than flattened because cannedLine() falls back
// through it, and because it is where a future distinction would go.
export const LINES = {
  greet: {
    neutral: [
      'Morning.',
      'Nice jacket.',
      'You new around here?',
      'Lovely light today, huh?',
      'Excuse me, coming through.',
      'Morning! Nice weather for once.',
      'Good to see a friendly face.',
      'How are those hands doing, friend?',
    ],
  },
  whisper_awe: {
    any: [
      "That's him. The one from the plaza. Don't stare.",
      'I heard he stopped a runaway truck with one punch.',
      'My cousin saw him throw a taxi. A TAXI.',
      "Shh — that's the guy. THE guy.",
    ],
  },
  witness_feat: {
    any: [
      'Did that just happen?!',
      'THE WALL. HE WENT THROUGH THE WALL.',
      'WHAT. Did anyone else just see that?!',
      'HOW?! He just— WHAT?!',
      'RUN! No— wait— WHAT IS HE?!',
      "Nobody's going to believe me. NOBODY.",
    ],
  },
  panic_scream: {
    any: ['AAAAAH!', 'RUN!', 'MOVE MOVE MOVE!', 'HELP! SOMEBODY HELP!', 'GET INSIDE!', 'IT’S ALL COMING DOWN!'],
  },
  hide_talk: {
    any: [
      'Is it gone? Tell me it’s gone.',
      'Stay down. Stay quiet.',
      'I should have moved to the coast.',
      'This wall won’t hold. This wall will NOT hold.',
    ],
  },
  idle_chatter: {
    any: [
      'Rent is criminal in Finance Row lately.',
      'They still haven’t fixed the hydrant on 2nd.',
      'Heard the diner has a new soup. Big if true.',
      'The dusk light is doing something beautiful today.',
      'My knees can feel the traffic lights change.',
      'I swear the pigeons are organizing.',
    ],
  },
  gossip_give: {
    any: [
      'You didn’t hear this from me, but that man in the jacket—',
      'Listen. The quiet guy? He is NOT a quiet guy.',
      'I saw it with my own eyes. Both of them.',
      'Something about him. The sleeves don’t sit right.',
    ],
  },
  talk_neutral: {
    any: [
      'Oh, hi. Need directions? The diner’s two blocks east.',
      'You look like you lift. A little. No offense.',
      'Quiet evening, huh? I like the quiet.',
      'If you hear screaming later, it wasn’t me.',
    ],
  },
};

export function cannedLine(situation, band = 'any') {
  const s = LINES[situation];
  if (!s) return null;
  const pool = s[band] || s.any || Object.values(s)[0];
  return pool[Math.floor(Math.random() * pool.length)];
}
