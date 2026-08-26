"use client";
import { Player } from "@remotion/player";
import { Promo30, SellingPoint15, Ugc30, DEFAULT_VIDEO_PROPS } from "@/remotion/compositions";
const map={SellingPoint15:{component:SellingPoint15,duration:450},Ugc30:{component:Ugc30,duration:900},Promo30:{component:Promo30,duration:900}};
export function CommerceVideoPlayer({template="Promo30"}:{template?:keyof typeof map}){const config=map[template]||map.Promo30;return <Player component={config.component} inputProps={DEFAULT_VIDEO_PROPS} durationInFrames={config.duration} compositionWidth={1080} compositionHeight={1920} fps={30} controls loop style={{width:"100%",maxHeight:"70vh",aspectRatio:"9/16",borderRadius:18,overflow:"hidden",boxShadow:"var(--shadow)"}}/>}
