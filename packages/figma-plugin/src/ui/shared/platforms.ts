export interface Platform {
  id: string;
  label: string;
  description: string;
  example: string;
}

export const PLATFORMS: Platform[] = [
  { id: 'css', label: 'CSS', description: 'CSS custom properties', example: '--color-brand: #0066ff;' },
  { id: 'dart', label: 'Dart', description: 'Flutter theme classes', example: 'static const colorBrand = Color(0xFF0066FF);' },
  { id: 'ios-swift', label: 'iOS Swift', description: 'UIKit / SwiftUI extensions', example: 'static let colorBrand = UIColor(...)' },
  { id: 'android', label: 'Android', description: 'XML resources / Compose', example: '<color name="color_brand">#0066FF</color>' },
  { id: 'json', label: 'JSON', description: 'W3C DTCG format', example: '"color-brand": { "$type": "color", "$value": "#0066ff" }' },
];
