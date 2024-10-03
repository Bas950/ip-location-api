import { describe, expect, it } from 'vitest'
import { aton4 } from './aton4'

describe('aton4', () => {
  it('should convert valid IPv4 addresses to 32-bit integers', () => {
    expect(aton4('192.168.1.1')).toBe(3232235777)
    expect(aton4('10.0.0.1')).toBe(167772161)
    expect(aton4('172.16.0.1')).toBe(2886729729)
    expect(aton4('255.255.255.255')).toBe(4294967295)
    expect(aton4('0.0.0.0')).toBe(0)
  })

  it('should handle leading zeros in octets', () => {
    expect(aton4('192.168.001.001')).toBe(3232235777)
    expect(aton4('010.000.000.001')).toBe(167772161)
  })

  it('should throw an error for invalid IPv4 addresses', () => {
    expect(() => aton4('192.168.1')).toThrow('Invalid IPv4 address: 192.168.1')
    expect(() => aton4('192.168.1.1.1')).toThrow('Invalid IPv4 address: 192.168.1.1.1')
    expect(() => aton4('')).toThrow('Invalid IPv4 address: ')
  })

  it('should handle edge cases', () => {
    expect(aton4('127.0.0.1')).toBe(2130706433) // Localhost
    expect(aton4('255.255.255.0')).toBe(4294967040) // Subnet mask
    expect(aton4('1.2.3.4')).toBe(16909060)
  })

  it('should handle all zeros and all ones', () => {
    expect(aton4('0.0.0.0')).toBe(0)
    expect(aton4('255.255.255.255')).toBe(4294967295)
  })
})
