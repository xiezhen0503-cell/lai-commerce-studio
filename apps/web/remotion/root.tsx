import { Composition } from "remotion";
import { DEFAULT_VIDEO_PROPS, Promo30, SellingPoint15, Ugc30 } from "./compositions";

export const COMMERCE_VIDEO_COMPOSITIONS = {
  SellingPoint15: { component: SellingPoint15, durationInFrames: 450 },
  Ugc30: { component: Ugc30, durationInFrames: 900 },
  Promo30: { component: Promo30, durationInFrames: 900 }
} as const;

export function RemotionRoot() {
  return <>
    {Object.entries(COMMERCE_VIDEO_COMPOSITIONS).map(([id, config]) => <Composition
      key={id}
      id={id}
      component={config.component}
      durationInFrames={config.durationInFrames}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={DEFAULT_VIDEO_PROPS}
    />)}
  </>;
}
