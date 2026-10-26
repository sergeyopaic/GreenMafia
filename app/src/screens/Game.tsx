import { GameBar } from '../components/GameBar';
import { useApp, useGame } from '../store';
import { GameOverScreen } from './game/GameOver';
import { MorningScreen } from './game/Morning';
import { NightScreen } from './game/Night';
import { RevealScreen } from './game/Reveal';
import { DefenseScreen, DiscussionScreen, LastWordsScreen } from './game/Speech';
import { VerdictScreen } from './game/Verdict';
import { VotingScreen } from './game/Voting';

export function GameScreen() {
  const state = useGame();
  const handBackAck = useApp((s) => s.handBackAck);
  const ackHandBack = useApp((s) => s.ackHandBack);
  const ph = state.phase;

  const needHandBack = state.dealing === 'app' && ph.t === 'night' && ph.number === 1 && ph.stepIndex === 0 && !handBackAck;

  return (
    <>
      <GameBar />
      {ph.t === 'reveal' && <RevealScreen />}
      {ph.t === 'night' && <NightScreen />}
      {ph.t === 'morning' && <MorningScreen />}
      {ph.t === 'lastWords' && <LastWordsScreen />}
      {ph.t === 'discussion' && <DiscussionScreen />}
      {ph.t === 'voting' && <VotingScreen />}
      {ph.t === 'defense' && <DefenseScreen />}
      {ph.t === 'verdict' && <VerdictScreen />}
      {ph.t === 'gameOver' && <GameOverScreen />}

      {needHandBack && (
        <div className="overlay">
          <div className="eyebrow">роли розданы</div>
          <h1>Верните телефон ведущему</h1>
          <p className="muted">Дальше экран видит только ведущий.</p>
          <button type="button" className="btn btn--primary" onClick={ackHandBack}>
            Телефон у ведущего
          </button>
        </div>
      )}
    </>
  );
}
