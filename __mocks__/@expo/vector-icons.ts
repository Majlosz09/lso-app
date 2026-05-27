import React from 'react'
import { Text } from 'react-native'

const createIconSet = () => {
  const Icon = ({ name }: { name: string }) =>
    React.createElement(Text, { testID: `icon-${name}` }, name)
  return Icon
}

module.exports = {
  Ionicons: createIconSet(),
  MaterialIcons: createIconSet(),
  FontAwesome: createIconSet(),
  AntDesign: createIconSet(),
}
