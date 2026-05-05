import { useWindowDimensions } from 'react-native';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isMobile  = width < 768;
  const isTablet  = width >= 768 && width < 1200;
  const isDesktop = width >= 1200;
  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    // Horizontal padding that tightens on narrow screens
    pagePadding: width < 480 ? 14 : width < 768 ? 20 : 28,
    // Modal should go full-width on mobile
    modalWidth: isMobile ? ('95%' as const) : ('100%' as const),
    modalMaxWidth: isMobile ? undefined : 500,
  };
}
