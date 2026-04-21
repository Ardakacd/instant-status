import Toast, { ToastShowParams } from "react-native-toast-message";

const VISIBILITY_TIME: Record<string, number> = {
  success: 3000,
  error: 5000,
  info: 4000,
};

export const toast = {
  show(params: ToastShowParams) {
    const type = params.type || "success";
    Toast.show({
      visibilityTime: VISIBILITY_TIME[type] ?? 4000,
      ...params,
    });
  },
};
