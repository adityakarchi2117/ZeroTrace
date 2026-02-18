import React from 'react';
import {
  Image,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';

import { colors } from '../../theme/colors';

interface TiltAvatarProps {
  children?: React.ReactNode;
  source?: ImageSourcePropType;
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  maxTilt?: number;
  scale?: number;
}

export const TiltAvatar: React.FC<TiltAvatarProps> = ({
  children,
  source,
  size,
  style,
  imageStyle,
}) => {
  const dimensionStyle = size
    ? {
        width: size,
        height: size,
        borderRadius: size / 2,
      }
    : undefined;

  if (source) {
    return (
      <View style={style}>
        <Image
          source={source}
          style={[
            {
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: colors.border.primary,
            },
            dimensionStyle,
            imageStyle,
          ]}
        />
      </View>
    );
  }

  if (size) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return <View style={style}>{children}</View>;
};
