import { useId } from 'react';
import { colourMatrix } from './visualEffects';

const deuteranopiaMatrix = colourMatrix('deuteranopia', 100).join(' ');

function SampleArtwork({ filterId }: { filterId?: string }) {
  return <svg width="440" height="320" viewBox="0 0 440 320" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    {filterId && <defs>
      <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="linearRGB">
        <feColorMatrix type="matrix" values={deuteranopiaMatrix}/>
        <feGaussianBlur stdDeviation="3.2"/>
      </filter>
    </defs>}
    <g filter={filterId ? `url(#${filterId})` : undefined}>
      <rect width="440" height="320" fill="#f7f3e9"/>
      <g fill="#173e38" fontFamily="Georgia, serif">
        <text x="22" y="35" fontSize="20">fern &amp; form</text>
        <text x="22" y="125" fontSize="31">Good things.</text>
        <text x="22" y="160" fontSize="31">Growing slowly.</text>
      </g>
      <g fill="#173e38" fontFamily="Arial, sans-serif">
        <text x="22" y="84" fontSize="8">A LITTLE ROOM TO GROW</text>
        <text x="22" y="190" fontSize="10">Thoughtful objects for a greener home.</text>
        <text x="22" y="302" fontSize="8">ADVERTISEMENT · STATIC PLACEHOLDER</text>
      </g>
      <rect x="22" y="215" width="144" height="33" fill="#314e37"/>
      <text x="34" y="236" fill="white" fontFamily="Arial, sans-serif" fontSize="10">Explore the collection ↗</text>
      <g transform="translate(255 55)">
        <ellipse cx="75" cy="200" rx="80" ry="15" fill="#d8d9c5"/>
        <path d="M40 120H115L103 200H52Z" fill="#b97750"/>
        <path d="M77 125C-20 50 20 10 77 125M77 125C75 -15 135 0 77 125M77 125C170 20 195 80 77 125" fill="#607b44"/>
      </g>
    </g>
  </svg>;
}

export function LandingComparison() {
  const filterId = useId();
  return <figure className="landing-comparison">
    <div className="landing-comparison-panes">
      <div>
        <div className="landing-comparison-label">Original</div>
        <div className="landing-comparison-page"><SampleArtwork/></div>
      </div>
      <div>
        <div className="landing-comparison-label">Simulated vision</div>
        <div className="landing-comparison-page"><SampleArtwork filterId={filterId}/></div>
      </div>
    </div>
    <figcaption>Same page, with a deuteranopia + blurred vision simulation on the right.</figcaption>
  </figure>;
}
