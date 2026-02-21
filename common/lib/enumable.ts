import { Class, transform, Enums, instanceOf } from 'effect/Schema';

export function EnumableClass<Self>(tag: string) {
  return <T extends string | number, Enum extends Record<string, T>>(
    enums: Enum,
  ) => {
    const enumSchema = Enums(enums);
    const Base = Class<Self>(tag)({
      inner: enumSchema,
    });

    class Enumable extends (Base as any) {
      static encode(inst: any) {
        return inst.inner;
      }
      static decode(val: any) {
        return new (this as any)({ inner: val });
      }
      toString() {
        return (this as any).inner;
      }
    }

    const cache = new Map<any, any>();

    for (const key in enums) {
      const value = enums[key];
      if (
        typeof key === 'string' &&
        (typeof value === 'string' || typeof value === 'number')
      ) {
        if (typeof value === 'number' && !isNaN(Number(key))) {
          continue;
        }
        Object.defineProperty(Enumable, key, {
          get() {
            if (!cache.has(value)) {
              cache.set(value, new (this as any)({ inner: value }));
            }
            return cache.get(value);
          },
          configurable: true,
          enumerable: true,
        });
      }
    }

    let _cachedAST: any = null;

    Object.defineProperty(Enumable, 'ast', {
      get(this: any) {
        if (!_cachedAST) {
          const klass = this;
          const transformSchema = transform(
            enumSchema as any,
            instanceOf(klass) as any,
            {
              decode: (val: any) => klass.decode(val),
              encode: (inst: any) => klass.encode(inst),
              strict: false,
            },
          );
          _cachedAST = (transformSchema as any).ast;
        }
        return _cachedAST;
      },
      configurable: true,
      enumerable: true,
    });

    return Enumable as unknown as typeof Base & {
      readonly [K in keyof Enum]: Self;
    };
  };
}
