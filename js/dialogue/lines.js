// Canned dialogue corpus. Structure: LINES[situation][band] where band is a
// karma band or 'any'. The game is fully voiced by these with no API key;
// Groq responses only add variety on top.
export const LINES = {
  greet: {
    saint: [
      "It's him! It's really him!",
      'Morning, champ! City feels safe with you around.',
      'My kid wants to be you when she grows up.',
      'Hey! You want a coffee? On the house. Forever.',
      'Bless you, big man.',
    ],
    good: [
      'Morning! Nice weather for once.',
      "Hey, you're that guy, right? The helpful one?",
      'Good to see a friendly face.',
      'How are those hands doing, friend?',
    ],
    neutral: [
      'Morning.',
      'Nice jacket.',
      'You new around here?',
      'Lovely dusk tonight, huh?',
      'Excuse me, coming through.',
    ],
    feared: [
      "Oh. It's you. I was just leaving.",
      "I don't want any trouble, okay?",
      'Please. I have a family.',
      "We're closed. Everything's closed.",
    ],
    monster: [
      'Stay away from me!',
      'SOMEBODY DO SOMETHING ABOUT HIM!',
      "Don't look at him. Don't look at him.",
      'You. You did all of this.',
    ],
  },
  thank: {
    any: [
      'You saved us! You actually saved us!',
      'THANK YOU! Oh my god, thank you!',
      "I owe you my life. Anything you need. Ever.",
      "Did you see that?! He took it down with his HANDS!",
    ],
  },
  whisper_awe: {
    any: [
      "That's him. The one from the plaza. Don't stare.",
      'I heard he stopped a monster with one punch.',
      'My cousin saw him throw a taxi. A TAXI.',
      "Shh — that's the guy. THE guy.",
    ],
  },
  witness_feat: {
    good: [
      'WHAT. Did anyone else just see that?!',
      'HOW?! He just— WHAT?!',
      "He's one of the good ones. Thank god. THANK GOD.",
    ],
    any: [
      'Did that just happen?!',
      "THE WALL. HE WENT THROUGH THE WALL.",
      'RUN! No— wait— WHAT IS HE?!',
      "Nobody's going to believe me. NOBODY.",
    ],
  },
  panic_scream: {
    any: ['AAAAAH!', 'RUN!', 'MOVE MOVE MOVE!', 'HELP! SOMEBODY HELP!', 'GET INSIDE!', 'IT’S COMING THIS WAY!'],
  },
  monster_spot: {
    any: [
      'MONSTER! THERE’S A MONSTER!',
      'CALL SOMEONE! CALL ANYONE!',
      'Not again. NOT AGAIN!',
      'It came from the fog! RUN!',
    ],
  },
  hide_talk: {
    any: [
      'Is it gone? Tell me it’s gone.',
      'Stay down. Stay quiet.',
      'I should have moved to the coast.',
      'This wall won’t hold. This wall will NOT hold.',
    ],
  },
  shop_closed: {
    any: [
      "We're closed. Permanently. While you're here.",
      'No no no, closing time.',
      "Take whatever you want. Please just don't swing.",
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
  insult: {
    any: [
      'You walking disaster. You ruin everything.',
      'They should build a wall around YOU.',
      'My insurance guy knows you by NAME.',
      'Monster in a jacket, that’s what you are.',
    ],
  },
  beg_mercy: {
    any: [
      'Please— please, I saw what you did to the bank.',
      'Take the register! Take the whole shop!',
      "I have three kids! Two! One at least, I'm pretty sure!",
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
  talk_awe: {
    any: [
      'It’s YOU. Can I— is it okay if I stand here?',
      'How do the sleeves survive?! Asking seriously.',
      'You could charge for photos. I’d pay.',
    ],
  },
  talk_terror: {
    any: [
      'Whatever you want. WHATEVER you want.',
      'I already called nobody. I promise.',
      'Please pick a different street. Please.',
    ],
  },
  monster_realize: {
    any: ['?!', 'RRAAAGH?!', '...'],
  },
};

export function cannedLine(situation, band = 'any') {
  const s = LINES[situation];
  if (!s) return null;
  const pool = s[band] || s.any || Object.values(s)[0];
  return pool[Math.floor(Math.random() * pool.length)];
}
