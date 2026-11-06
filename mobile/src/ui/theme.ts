import {useColorScheme} from 'react-native';
import {DarkTheme,DefaultTheme,type Theme as NavigationTheme} from '@react-navigation/native';

const light={
 background:'#FFFFFF',surface:'#F7F9FD',surfaceElevated:'#FFFFFF',surfaceSecondary:'#EEF3FA',
 primary:'#0866F5',primaryPressed:'#0754CC',tertiary:'#BF1C62',tertiarySurface:'#FDEAF2',
 textPrimary:'#14213D',textSecondary:'#52637A',textMuted:'#64748B',border:'#E2E8F0',divider:'#E2E8F0',
 inputBackground:'#FFFFFF',inputBorder:'#7B879A',tabBarBackground:'#FFFFFF',tabActive:'#0754CC',tabInactive:'#52637A',
 success:'#176646',successSurface:'#E8F5EE',warning:'#795000',warningSurface:'#FFF4DC',error:'#A4262C',errorSurface:'#FCECEE',
 info:'#215A91',infoSurface:'#E8F1FC',purple:'#7535AE',purpleSurface:'#F0E5FC',
 disabled:'#E2E8F0',onDisabled:'#52637A',onPrimary:'#FFFFFF',danger:'#A4262C',overlay:'rgba(8,20,38,0.48)',
 primarySurface:'#EEF3FA',shadow:'#081426',mediaBackground:'#081426',onMedia:'#F7F9FF',
};
export type ThemeColors={ [K in keyof typeof light]:string };
const dark:ThemeColors={
 background:'#081426',surface:'#14243D',surfaceElevated:'#1B2C46',surfaceSecondary:'#101E33',
 primary:'#0866F5',primaryPressed:'#0754CC',tertiary:'#FF80B5',tertiarySurface:'#3B2037',
 textPrimary:'#F7F9FF',textSecondary:'#AAB7CD',textMuted:'#AAB7CD',border:'#2A3C56',divider:'#2A3C56',
 inputBackground:'#101E33',inputBorder:'#71839D',tabBarBackground:'#101E33',tabActive:'#8ABBFF',tabInactive:'#AAB7CD',
 success:'#8DDCB1',successSurface:'#143B31',warning:'#F3CC83',warningSurface:'#3C301C',error:'#FFB4AB',errorSurface:'#432830',
 info:'#9BC8FF',infoSurface:'#182F4E',purple:'#D2AEFF',purpleSurface:'#302343',
 disabled:'#293B54',onDisabled:'#B5C2D5',onPrimary:'#FFFFFF',danger:'#A4262C',overlay:'rgba(0,0,0,0.65)',
 primarySurface:'#172D4B',shadow:'#000000',mediaBackground:'#081426',onMedia:'#F7F9FF',
};
// Compatibility aliases keep existing layouts on the same semantic palette.
function palette(c:ThemeColors,mode:'light'|'dark'){return {...c,mode,text:c.textPrimary,muted:c.textSecondary,mint:c.primarySurface,accent:c.tabActive,secondary:c.tabActive,forest:c.primaryPressed};}
export const palettes={light:palette(light,'light'),dark:palette(dark,'dark')};
export function usePalette(){return palettes[useColorScheme()==='dark'?'dark':'light'];}
export function navigationTheme(scheme:string|null|undefined):NavigationTheme{
 const isDark=scheme==='dark',p=palettes[isDark?'dark':'light'],base=isDark?DarkTheme:DefaultTheme;
 return {...base,dark:isDark,colors:{...base.colors,primary:p.primary,background:p.background,card:p.surfaceElevated,text:p.text,border:p.border,notification:p.tertiary}};
}
