/**
 * Spinner component - Loading indicator
 * Displays animated spinner with optional label
 */

import React from 'react';
import { Text } from './Text.js';
import InkSpinner from 'ink-spinner';
import type { ColorValue } from '../../theme/colors.js';

export interface SpinnerProps {
  /** Label text to display next to spinner */
  label?: string;

  /** Spinner animation type */
  type?:
    | 'dots'
    | 'dots2'
    | 'dots3'
    | 'dots4'
    | 'dots5'
    | 'dots6'
    | 'dots7'
    | 'dots8'
    | 'dots9'
    | 'dots10'
    | 'dots11'
    | 'dots12'
    | 'line'
    | 'line2'
    | 'pipe'
    | 'simpleDots'
    | 'simpleDotsScrolling'
    | 'star'
    | 'star2'
    | 'flip'
    | 'hamburger'
    | 'growVertical'
    | 'growHorizontal'
    | 'balloon'
    | 'balloon2'
    | 'noise'
    | 'bounce'
    | 'boxBounce'
    | 'boxBounce2'
    | 'triangle'
    | 'arc'
    | 'circle'
    | 'squareCorners'
    | 'circleQuarters'
    | 'circleHalves'
    | 'squish'
    | 'toggle'
    | 'toggle2'
    | 'toggle3'
    | 'toggle4'
    | 'toggle5'
    | 'toggle6'
    | 'toggle7'
    | 'toggle8'
    | 'toggle9'
    | 'toggle10'
    | 'toggle11'
    | 'toggle12'
    | 'toggle13'
    | 'arrow'
    | 'arrow2'
    | 'arrow3'
    | 'bouncingBar'
    | 'bouncingBall'
    | 'smiley'
    | 'monkey'
    | 'hearts'
    | 'clock'
    | 'earth'
    | 'material'
    | 'moon'
    | 'runner'
    | 'pong'
    | 'shark'
    | 'dqpb'
    | 'weather'
    | 'christmas'
    | 'grenade'
    | 'point'
    | 'layer'
    | 'betaWave';

  /** Color of the spinner */
  color?: ColorValue | string;
}

/**
 * Spinner component for loading states
 *
 * @example
 * ```tsx
 * <Spinner label="Loading..." />
 * <Spinner label="Thinking..." type="dots" color="cyan" />
 * <Spinner type="arc" />
 * ```
 */
export const Spinner: React.FC<SpinnerProps> = ({
  label = 'Loading...',
  type = 'dots',
  color = 'cyan',
}) => {
  return (
    <Text color={color}>
      <InkSpinner type={type} /> {label}
    </Text>
  );
};

/**
 * LoadingSpinner - Alias for Spinner component
 * Maintains backward compatibility with the design document
 */
export const LoadingSpinner = Spinner;
