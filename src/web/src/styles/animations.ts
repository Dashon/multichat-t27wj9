// @mui/material/styles v5.14+
import { keyframes } from '@mui/material/styles';

// Animation Duration Constants (in milliseconds)
export const ANIMATION_DURATION = {
  FAST: 200,
  NORMAL: 300,
  SLOW: 400,
} as const;

// Material Design 3 Easing Curves
export const EASING = {
  // Standard easing for most animations
  STANDARD: 'cubic-bezier(0.4, 0, 0.2, 1)',
  // Easing for elements exiting or collapsing
  ACCELERATE: 'cubic-bezier(0.4, 0, 1, 1)',
  // Easing for elements entering or expanding
  DECELERATE: 'cubic-bezier(0, 0, 0.2, 1)',
} as const;

// Media query for respecting reduced motion preferences
export const REDUCED_MOTION_QUERY = '@media (prefers-reduced-motion: reduce)';

/**
 * Interface for configuring animation options
 */
export interface AnimationOptions {
  duration: number;
  easing: string;
  delay?: number;
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  respectReducedMotion: boolean;
}

/**
 * Interface for theme transition configuration
 */
export interface ThemeTransition {
  duration: number;
  properties: string[];
  easing: string;
  respectReducedMotion: boolean;
}

/**
 * Creates optimized fade animation keyframes
 * @param startOpacity - Initial opacity value
 * @param endOpacity - Final opacity value
 * @param respectReducedMotion - Whether to respect reduced motion preferences
 */
export const createFadeAnimation = (
  startOpacity: number,
  endOpacity: number,
  respectReducedMotion: boolean = true
) => {
  if (respectReducedMotion) {
    return keyframes`
      ${REDUCED_MOTION_QUERY} {
        from, to {
          opacity: ${endOpacity};
        }
      }
      
      from {
        opacity: ${startOpacity};
      }
      to {
        opacity: ${endOpacity};
      }
    `;
  }

  return keyframes`
    from {
      opacity: ${startOpacity};
    }
    to {
      opacity: ${endOpacity};
    }
  `;
};

/**
 * Creates performant scale animation keyframes using transform
 * @param startScale - Initial scale value
 * @param endScale - Final scale value
 * @param respectReducedMotion - Whether to respect reduced motion preferences
 */
export const createScaleAnimation = (
  startScale: number,
  endScale: number,
  respectReducedMotion: boolean = true
) => {
  if (respectReducedMotion) {
    return keyframes`
      ${REDUCED_MOTION_QUERY} {
        from, to {
          transform: scale(${endScale});
        }
      }
      
      from {
        transform: scale(${startScale});
      }
      to {
        transform: scale(${endScale});
      }
    `;
  }

  return keyframes`
    from {
      transform: scale(${startScale});
    }
    to {
      transform: scale(${endScale});
    }
  `;
};

// Fade-in animation configuration
export const fadeIn = {
  keyframes: createFadeAnimation(0, 1, true),
  options: {
    duration: ANIMATION_DURATION.NORMAL,
    easing: EASING.DECELERATE,
    fillMode: 'forwards',
    respectReducedMotion: true,
  } as AnimationOptions,
};

// Fade-out animation configuration
export const fadeOut = {
  keyframes: createFadeAnimation(1, 0, true),
  options: {
    duration: ANIMATION_DURATION.NORMAL,
    easing: EASING.ACCELERATE,
    fillMode: 'forwards',
    respectReducedMotion: true,
  } as AnimationOptions,
};

// Scale-in animation configuration
export const scaleIn = {
  keyframes: createScaleAnimation(0.95, 1, true),
  options: {
    duration: ANIMATION_DURATION.NORMAL,
    easing: EASING.DECELERATE,
    fillMode: 'forwards',
    respectReducedMotion: true,
  } as AnimationOptions,
};

// Theme transition configuration
export const themeTransition: ThemeTransition = {
  duration: ANIMATION_DURATION.NORMAL,
  properties: [
    'background-color',
    'color',
    'border-color',
    'box-shadow',
    'opacity',
    'transform',
  ],
  easing: EASING.STANDARD,
  respectReducedMotion: true,
};

// Default animation options
export const defaultAnimationOptions: AnimationOptions = {
  duration: ANIMATION_DURATION.NORMAL,
  easing: EASING.STANDARD,
  fillMode: 'both',
  respectReducedMotion: true,
};