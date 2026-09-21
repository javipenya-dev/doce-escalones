import 'package:flutter/material.dart';

/// Identidad corporativa 12 Escalones
/// Naranja: #E75F00 (PANTONE Bright Orange C)
class AppColors {
  static const orange = Color(0xFFE75F00);
  static const orangeLight = Color(0xFFFF7A20);
  static const orangeDark = Color(0xFFB84C00);
  static const orangePale = Color(0xFFFFF0E6);

  static const black = Color(0xFF111111);
  static const blackSoft = Color(0xFF1C1C1C);
  static const blackCard = Color(0xFF242424);
  static const greyDark = Color(0xFF3A3A3A);
  static const greyMid = Color(0xFF6F6E6E);
  static const greyLight = Color(0xFFAAAAAA);
  static const greyBorder = Color(0xFFE8E8E8);
  static const white = Color(0xFFFFFFFF);
  static const whiteOff = Color(0xFFF9F9F9);

  // Semáforo
  static const verde = Color(0xFF22C55E);
  static const verdeBg = Color(0xFFDCFCE7);
  static const rojo = Color(0xFFEF4444);
  static const rojoBg = Color(0xFFFEE2E2);
  static const amarillo = Color(0xFFEAB308);
  static const amarilloBg = Color(0xFFFEF9C3);
  static const naranja = Color(0xFFF97316);
  static const naranjaBg = Color(0xFFFFEDD5);
  static const morado = Color(0xFF9333EA);
  static const moradoBg = Color(0xFFF3E8FF);
}

Color colorEstado(String estado) {
  switch (estado) {
    case 'verde': return AppColors.verde;
    case 'rojo': return AppColors.rojo;
    case 'amarillo': return AppColors.amarillo;
    case 'naranja': return AppColors.naranja;
    case 'morado': return AppColors.morado;
    default: return AppColors.greyMid;
  }
}

Color colorEstadoBg(String estado) {
  switch (estado) {
    case 'verde': return AppColors.verdeBg;
    case 'rojo': return AppColors.rojoBg;
    case 'amarillo': return AppColors.amarilloBg;
    case 'naranja': return AppColors.naranjaBg;
    case 'morado': return AppColors.moradoBg;
    default: return AppColors.whiteOff;
  }
}

final ThemeData appTheme = ThemeData(
  useMaterial3: true,
  fontFamily: 'Roboto',
  scaffoldBackgroundColor: AppColors.whiteOff,
  colorScheme: ColorScheme.fromSeed(
    seedColor: AppColors.orange,
    primary: AppColors.orange,
    brightness: Brightness.light,
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: AppColors.white,
    foregroundColor: AppColors.black,
    elevation: 0,
    centerTitle: false,
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: AppColors.orange,
      foregroundColor: AppColors.white,
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: AppColors.white,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppColors.greyBorder),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppColors.orange, width: 1.5),
    ),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
  ),
  cardTheme: CardThemeData(
    color: AppColors.white,
    elevation: 0,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
      side: const BorderSide(color: AppColors.greyBorder),
    ),
  ),
);