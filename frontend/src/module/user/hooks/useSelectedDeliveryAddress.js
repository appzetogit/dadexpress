import { useCallback, useEffect, useState } from "react";
import {
  DELIVERY_ADDRESS_EVENT,
  getSelectedDeliveryAddress,
  setSelectedDeliveryAddress,
} from "../utils/deliveryAddress";

export function useSelectedDeliveryAddress() {
  const [selected, setSelected] = useState(() => getSelectedDeliveryAddress());

  useEffect(() => {
    const handler = (event) => {
      if (event?.detail !== undefined) {
        setSelected(event.detail);
        return;
      }
      setSelected(getSelectedDeliveryAddress());
    };

    window.addEventListener(DELIVERY_ADDRESS_EVENT, handler);
    return () => {
      window.removeEventListener(DELIVERY_ADDRESS_EVENT, handler);
    };
  }, []);

  const updateSelection = useCallback((next) => {
    setSelectedDeliveryAddress(next);
    setSelected(next);
  }, []);

  return {
    selectedDeliveryAddress: selected,
    setSelectedDeliveryAddress: updateSelection,
  };
}
