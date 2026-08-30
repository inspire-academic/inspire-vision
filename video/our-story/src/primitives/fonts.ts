import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadJakarta } from '@remotion/google-fonts/PlusJakartaSans';

export const { fontFamily: frauncesFamily } = loadFraunces('italic', {
  weights: ['400', '500'],
});
export const { fontFamily: jakartaFamily } = loadJakarta('normal', {
  weights: ['400', '500', '600'],
});
