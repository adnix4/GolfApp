import { s } from './eventPageStyles';

/**
 * Shown above the leaderboard during 'active' and 'scoring' status. Links to
 * both the public live-scores view and the TV-mode variant for projecting.
 */
export default function LiveScoresBanner({
  orgSlug,
  eventCode,
}: {
  orgSlug:   string;
  eventCode: string;
}) {
  return (
    <section style={s.liveBanner}>
      <div style={s.liveBannerInfo}>
        <span style={s.livePill}>
          <span style={s.livePulse} />
          Live
        </span>
        <p style={s.liveBannerText}>Round in progress — scores update in real time</p>
      </div>
      <div style={s.liveBannerActions}>
        <a href={`/e/${orgSlug}/${eventCode}/scores`} style={s.liveBtn}>
          📊 Watch Live Scores
        </a>
        <a href={`/e/${orgSlug}/${eventCode}/scores?tv=1`} style={s.tvBtn}>
          📺 TV Mode
        </a>
      </div>
    </section>
  );
}
