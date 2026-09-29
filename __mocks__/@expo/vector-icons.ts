import React from 'react'
import { Text } from 'react-native'

const createIconSet = () => {
  const Icon = ({ name }: { name: string }) =>
    React.createElement(Text, { testID: `icon-${name}` }, name)
  return Icon
}

const MaterialCommunityIcons = Object.assign(createIconSet(), {
  glyphMap: jest.requireActual(
    '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json',
  ),
})

module.exports = {
  Ionicons: createIconSet(),
  MaterialIcons: createIconSet(),
  MaterialCommunityIcons,
  FontAwesome: createIconSet(),
  AntDesign: createIconSet(),
}
