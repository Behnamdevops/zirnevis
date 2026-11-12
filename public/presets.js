// Built-in caption styles. Every field is editable in the Style panel.
export const BASE = {
  fontFamily: 'Vazirmatn', fontWeight: 800, fontSize: 76, lineHeight: 1.3, maxWidth: 0.84, posY: 0.7, wordGap: 1,
  maxWords: 4, maxChars: 30, mode: 'line', // line | reveal | single
  textColor: '#FFFFFF', gradient: false, gradientTo: '#D9D9D9',
  highlightActive: true, activeColor: '#FFE600', activeGradientTo: '', activeScale: 1.12, rainbow: false,
  fillSpoken: false, spokenColor: '#22C55E', dimUpcoming: false,
  activeBox: false, activeBoxColor: '#7C3AED', activeBoxRadius: 16, boxShadow: false,
  wordBox: false, wordBoxColor: '#FFFFFF',
  underline: false, underlineColor: '#22D3EE',
  strokeWidth: 6, strokeColor: '#000000', stroke2Width: 0, stroke2Color: '#FF3B30',
  shadowColor: '#000000', shadowOpacity: 0.5, shadowBlur: 12, shadowX: 0, shadowY: 4, glow: 0,
  bgColor: '#000000', bgOpacity: 0, bgRadius: 14,
  groupAnim: 'pop', wordAnim: 'pop', wordAnimAll: false, rotate: 0,
};

const P = (id, name, o) => ({ id, name, style: { ...BASE, ...o } });

// Shared looks
const HARD = { shadowBlur: 0, shadowOpacity: 1 };            // crisp offset "3D" shadow
const SOFT = { shadowBlur: 22, shadowY: 6, shadowOpacity: 0.55 };

export const PRESETS = [
  // --- bold reels looks ---
  P('reels', 'ریلز کلاسیک', {
    fontWeight: 900, fontSize: 82, strokeWidth: 7, ...HARD, shadowY: 7, shadowColor: '#000000',
    activeColor: '#FFE14D', activeScale: 1.15, groupAnim: 'pop',
  }),
  P('gold', 'تیتر طلایی', {
    fontFamily: 'Lalezar', fontWeight: 400, fontSize: 96, maxWords: 3, strokeWidth: 8, strokeColor: '#1A0F00',
    gradient: true, textColor: '#FFFFFF', gradientTo: '#FFE9B0', activeColor: '#FFE45C', activeGradientTo: '#FF8A00',
    ...HARD, shadowY: 8, shadowColor: '#000000', activeScale: 1.14, groupAnim: 'zoom',
  }),
  P('comic', 'کمیک', {
    fontFamily: 'Lalezar', fontWeight: 400, fontSize: 94, maxWords: 3, strokeWidth: 7, strokeColor: '#000000',
    stroke2Width: 5, stroke2Color: '#FFFFFF', wordGap: 1.3, ...HARD, shadowX: 6, shadowY: 8, shadowColor: '#000000',
    textColor: '#FFFFFF', activeColor: '#FFD60A', activeScale: 1.18, rotate: 4, groupAnim: 'bounce',
  }),
  P('3d', 'سایه‌ی سه‌بعدی', {
    fontWeight: 900, fontSize: 84, strokeWidth: 0, ...HARD, shadowX: 6, shadowY: 7, shadowColor: '#7C3AED',
    activeColor: '#FDE047', activeScale: 1.12, groupAnim: 'slide',
  }),

  // --- box / highlight looks ---
  P('box', 'هایلایت بنفش', {
    fontWeight: 800, fontSize: 76, maxWords: 3, strokeWidth: 0, ...SOFT, activeBox: true, activeBoxColor: '#7C3AED',
    activeBoxRadius: 18, boxShadow: true, activeColor: '#FFFFFF', activeScale: 1.06, groupAnim: 'fade',
  }),
  P('lime', 'جعبه‌ی لیمویی', {
    fontWeight: 900, fontSize: 78, maxWords: 3, strokeWidth: 0, ...SOFT, activeBox: true, activeBoxColor: '#D4FF3A',
    activeBoxRadius: 12, boxShadow: true, activeColor: '#0B0B0B', activeScale: 1.08, groupAnim: 'slide',
  }),
  P('pill', 'قرص سفید', {
    fontWeight: 800, fontSize: 72, maxWords: 4, strokeWidth: 0, ...SOFT, activeBox: true, activeBoxColor: '#FFFFFF',
    activeBoxRadius: 60, boxShadow: true, activeColor: '#111111', activeScale: 1.05, groupAnim: 'fade',
  }),
  P('sticker', 'برچسبی', {
    fontFamily: 'Lalezar', fontWeight: 400, fontSize: 80, maxWords: 3, strokeWidth: 0, shadowOpacity: 0,
    wordBox: true, wordBoxColor: '#FFFFFF', textColor: '#111111', activeBox: true, activeBoxColor: '#FF3B30',
    activeBoxRadius: 10, boxShadow: true, activeColor: '#FFFFFF', activeScale: 1.1, rotate: 3, groupAnim: 'pop', wordAnimAll: true, wordAnim: 'pop',
  }),
  P('ocean', 'اقیانوسی', {
    fontWeight: 800, fontSize: 74, maxWords: 3, strokeWidth: 0, ...SOFT, activeBox: true, activeBoxColor: '#0EA5E9',
    activeBoxRadius: 14, boxShadow: true, textColor: '#E0F2FE', activeColor: '#FFFFFF', activeScale: 1.07, groupAnim: 'slide',
  }),

  // --- single word ---
  P('single', 'تک‌کلمه سینمایی', {
    mode: 'single', fontWeight: 900, fontSize: 140, posY: 0.55, strokeWidth: 9, ...HARD, shadowY: 10,
    activeColor: '#FFFFFF', wordAnim: 'bounce', groupAnim: 'none',
  }),
  P('single-color', 'تک‌کلمه رنگی', {
    mode: 'single', fontFamily: 'Lalezar', fontWeight: 400, fontSize: 150, posY: 0.55, strokeWidth: 9, ...HARD, shadowY: 9,
    rainbow: true, wordAnim: 'zoom', groupAnim: 'none',
  }),

  // --- glow ---
  P('neon-pink', 'نئون صورتی', {
    fontWeight: 800, fontSize: 80, strokeWidth: 0, textColor: '#FFE4F2', activeColor: '#FF2E97', glow: 42,
    shadowOpacity: 0.6, shadowBlur: 16, shadowY: 0, shadowColor: '#5B0033', activeScale: 1.1, groupAnim: 'fade',
  }),
  P('neon', 'نئون آبی', {
    fontWeight: 800, fontSize: 80, strokeWidth: 0, textColor: '#E6FFFF', activeColor: '#00F0FF', glow: 40,
    shadowOpacity: 0.6, shadowBlur: 16, shadowY: 0, shadowColor: '#00262B', activeScale: 1.1, groupAnim: 'fade',
  }),

  // --- word-by-word ---
  P('rainbow', 'پاپ رنگی', {
    fontWeight: 900, fontSize: 84, strokeWidth: 8, ...HARD, shadowY: 7, rainbow: true, activeScale: 1.2, rotate: 3, groupAnim: 'pop',
  }),
  P('karaoke', 'کارائوکه', {
    fontWeight: 800, fontSize: 72, maxWords: 5, strokeWidth: 6, ...HARD, shadowY: 5,
    fillSpoken: true, spokenColor: '#4ADE80', dimUpcoming: true, highlightActive: false, activeScale: 1, groupAnim: 'fade',
  }),
  P('reveal', 'ظاهرشونده', {
    mode: 'reveal', fontWeight: 900, fontSize: 80, strokeWidth: 7, ...HARD, shadowY: 6,
    activeColor: '#FF4D6D', wordAnim: 'rise', groupAnim: 'none', maxWords: 5,
  }),
  P('underline', 'خط‌کش', {
    fontWeight: 800, fontSize: 74, maxWords: 4, strokeWidth: 0, ...SOFT, highlightActive: true, activeColor: '#FFFFFF',
    textColor: '#E5E7EB', underline: true, underlineColor: '#22D3EE', activeScale: 1.05, groupAnim: 'slide',
  }),

  // --- calm / editorial ---
  P('glass', 'نوار شیشه‌ای', {
    fontWeight: 700, fontSize: 58, maxWords: 6, maxChars: 40, posY: 0.8, strokeWidth: 0, shadowOpacity: 0,
    bgColor: '#0B0B0F', bgOpacity: 0.55, bgRadius: 22, activeColor: '#7DD3FC', activeScale: 1, groupAnim: 'fade',
  }),
  P('luxury', 'لوکس', {
    fontFamily: 'El Messiri', fontWeight: 700, fontSize: 70, maxWords: 5, strokeWidth: 0, ...SOFT,
    gradient: true, textColor: '#FFF6D8', gradientTo: '#D9B45A', activeColor: '#FFFFFF', activeGradientTo: '#F5D88A',
    activeScale: 1.04, groupAnim: 'fade',
  }),
  P('minimal', 'مینیمال', {
    fontWeight: 600, fontSize: 56, maxWords: 7, maxChars: 40, posY: 0.84, strokeWidth: 0, shadowOpacity: 0.85,
    shadowBlur: 14, shadowY: 2, highlightActive: false, activeScale: 1, groupAnim: 'fade',
  }),
  P('bold-red', 'تیتر قرمز', {
    fontFamily: 'Lalezar', fontWeight: 400, fontSize: 94, maxWords: 3, strokeWidth: 9, ...HARD, shadowY: 8,
    activeColor: '#FF3B30', activeScale: 1.18, groupAnim: 'zoom',
  }),
];

// Persian-capable Google Fonts loaded by default (custom fonts are added on top).
export const BUILTIN_FONTS = ['Vazirmatn', 'Lalezar', 'Noto Kufi Arabic', 'Changa', 'Reem Kufi', 'Lemonada', 'El Messiri', 'Markazi Text'];
