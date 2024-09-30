import type { WriteStream } from 'node:fs'
import type { IpLocationApiSettings } from '../getSettings.js'
import type { LocationData } from './createDatabase.js'
import { Buffer } from 'node:buffer'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { parse } from '@fast-csv/parse'
import { Address4, Address6 } from 'ip-address'
import { aton4 } from '../aton4.js'
import { aton6 } from '../aton6.js'
import { getPostcodeDatabase } from '../getPostcodeDatabase.js'
import { makeDatabase } from '../makeDatabase.js'
import { createSmallMemoryFile } from './createSmallMemoryFile.js'

interface BlockDatabaseRow {
  network: string
  geoname_id: string
  latitude: string
  longitude: string
  accuracy_radius: string
  postal_code: string
}

/**
 * Creates a block database for IP geolocation.
 * @param file - The CSV file containing IP block data.
 * @param locationData - An array of records containing location data.
 * @param locationIdList - A list of location IDs.
 * @param settings - IP location API settings.
 */
export async function createBlockDatabase(
  file: string,
  locationData: Record<number, LocationData | string>[],
  locationIdList: number[],
  settings: IpLocationApiSettings,
): Promise<void> {
  const version = file.endsWith('v4.csv') ? 4 : 6
  const readStream = createReadStream(path.join(settings.tmpDataDir, file))
  const writeStreamDat1 = createWriteStream(path.join(settings.fieldDir, `${version}-1.dat.tmp`), { highWaterMark: 1024 * 1024 })

  let writeStreamDat2: WriteStream | undefined
  let writeStreamDat3: WriteStream | undefined
  let writeStreamSmallMemory: WriteStream | undefined

  if (!settings.smallMemory) {
    writeStreamDat2 = createWriteStream(path.join(settings.fieldDir, `${version}-2.dat.tmp`), { highWaterMark: 1024 * 1024 })
    writeStreamDat3 = createWriteStream(path.join(settings.fieldDir, `${version}-3.dat.tmp`), { highWaterMark: 1024 * 1024 })
  }
  else {
    const dir = path.join(settings.fieldDir, `v${version}-tmp`)
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true })
    }
  }

  const areaDatabase: Record<string, number> = {}

  return new Promise<void>((resolve, reject) => {
    let checkCount = 0
    function check() {
      if (++checkCount === 3)
        resolve()
    }

    let previousData: {
      countryCode?: string
      end: number | bigint
      buffer1: Buffer
      buffer2: Buffer
      buffer3: Buffer
      locationId?: number
      latitude?: number
      longitude?: number
      accuracyRadius?: string
      postalCode?: string
      counter?: number
    } | undefined
    let lineCount = 0

    readStream.pipe(parse({ headers: true }))
      .on('error', reject)
      .on('data', (row: BlockDatabaseRow) => {
        const addr = version === 4 ? new Address4(row.network!) : new Address6(row.network!)
        const start = version === 4 ? aton4(addr.startAddress().correctForm()) : aton6(addr.startAddress().correctForm())
        const end = version === 4 ? aton4(addr.endAddress().correctForm()) : aton6(addr.endAddress().correctForm())

        if (settings.dataType === 'Country') {
          const locationDataMap = locationData[0] as Record<number, string>
          const countryCode = locationDataMap[Number.parseInt(row.geoname_id)]

          if (!countryCode || countryCode.length !== 2) {
            return //* Invalid country code
          }

          if (
            countryCode === previousData?.countryCode
            && (
              (version === 4 && (previousData.end as number) + 1 === start)
              || (version === 6 && (previousData.end as bigint) + 1n === start)
            )
          ) {
            if (version === 4) {
              previousData.buffer2.writeUInt32LE(end as number)
            }
            else {
              previousData.buffer2.writeBigUInt64LE(end as bigint)
            }
          }
          else {
            const buffer1 = Buffer.allocUnsafe(version === 4 ? 4 : 8)
            const buffer2 = Buffer.allocUnsafe(version === 4 ? 4 : 8)
            if (version === 4) {
              buffer1.writeUInt32LE(start as number)
              buffer2.writeUInt32LE(end as number)
            }
            else {
              buffer1.writeBigUInt64LE(start as bigint)
              buffer2.writeBigUInt64LE(end as bigint)
            }

            const buffer3 = Buffer.allocUnsafe(2)
            buffer3.write(countryCode)

            if (previousData?.buffer1) {
              if (!writeStreamDat1.write(previousData.buffer1))
                readStream.pause()
              if (settings.smallMemory) {
                writeStreamSmallMemory = createSmallMemoryFile(writeStreamSmallMemory!, version, lineCount++, previousData.buffer2, previousData.buffer3, settings)
              }
              else {
                if (!writeStreamDat2!.write(previousData.buffer2))
                  readStream.pause()
                if (!writeStreamDat3!.write(previousData.buffer3))
                  readStream.pause()
              }
            }

            previousData = {
              countryCode,
              end,
              buffer1,
              buffer2,
              buffer3,
            }
          }
        }
        else {
          const locationDataMap = locationData[0] as Record<number, LocationData>
          const locationId = Number.parseInt(row.geoname_id)
          const latitude = Math.round(Number.parseFloat(row.latitude) * 10000)
          const longitude = Math.round(Number.parseFloat(row.longitude) * 10000)
          const accuracyRadius = row.accuracy_radius
          const postalCode = row.postal_code

          //* Check if any relevant fields have changed from the previous entry
          let hasChanged = false
          if (settings.fields.includes('latitude') && latitude !== previousData?.latitude)
            hasChanged = true
          if (settings.fields.includes('longitude') && longitude !== previousData?.longitude)
            hasChanged = true
          if (settings.fields.includes('area') && accuracyRadius !== previousData?.accuracyRadius)
            hasChanged = true
          if (settings.fields.includes('postcode') && postalCode !== previousData?.postalCode)
            hasChanged = true

          let counter = locationDataMap[locationId]?.counter ?? 0

          //* Check if we can merge this entry with the previous one
          if (
            previousData
            && ((locationId === previousData.locationId || counter > 0)
              && (
                counter === previousData.counter || !settings.locationFile
              ))
              && !hasChanged
              && (
                (version === 4 && (previousData.end as number) + 1 === start)
                || (version === 6 && (previousData.end as bigint) + 1n === start)
              )
          ) {
            //* Merge by updating the end of the previous entry
            if (version === 4) {
              previousData.buffer2.writeUInt32LE(end as number)
            }
            else {
              previousData.buffer2.writeBigUInt64LE(end as bigint)
            }
          }
          else {
            if (!locationId)
              return // TODO add debug log

            const dataMap = locationDataMap[locationId]
            if (!dataMap)
              return // TODO add debug log

            //* Assign a counter if it doesn't exist
            if (!dataMap.counter) {
              locationIdList.push(locationId)
              counter = dataMap.counter = locationIdList.length
            }

            //* Write the previous data if it exists
            if (previousData?.buffer1) {
              if (!writeStreamDat1.write(previousData.buffer1))
                readStream.pause()
              if (settings.smallMemory) {
                writeStreamSmallMemory = createSmallMemoryFile(writeStreamSmallMemory!, version, lineCount++, previousData.buffer2, previousData.buffer3, settings)
              }
              else {
                if (!writeStreamDat2!.write(previousData.buffer2))
                  readStream.pause()
                if (!writeStreamDat3!.write(previousData.buffer3))
                  readStream.pause()
              }
            }

            //* Create new buffers for the current entry
            const buffer1 = Buffer.allocUnsafe(version === 4 ? 4 : 8)
            const buffer2 = Buffer.allocUnsafe(version === 4 ? 4 : 8)
            if (version === 4) {
              buffer1.writeUInt32LE(start as number)
              buffer2.writeUInt32LE(end as number)
            }
            else {
              buffer1.writeBigUInt64LE(start as bigint)
              buffer2.writeBigUInt64LE(end as bigint)
            }

            const buffer3 = Buffer.alloc(settings.mainRecordSize)

            let offset = 0
            //* Write location data to buffer3 based on settings
            if (settings.locationFile) {
              buffer3.writeUInt32LE(counter, offset)
              offset += 4
            }

            if (settings.fields.includes('latitude')) {
              buffer3.writeInt32LE(latitude, offset)
              offset += 4
            }

            if (settings.fields.includes('longitude')) {
              buffer3.writeInt32LE(longitude, offset)
              offset += 4
            }

            if (settings.fields.includes('postcode')) {
              const [postcodeLength, postcodeValue] = getPostcodeDatabase(postalCode)
              buffer3.writeUInt32LE(postcodeLength, offset)
              offset += 4
              buffer3.writeInt8(postcodeValue, offset)
              offset += 1
            }

            if (settings.fields.includes('area')) {
              buffer3.writeUInt8(makeDatabase(accuracyRadius, areaDatabase), offset)
            }

            //* Update previousData for the next iteration
            previousData = {
              locationId,
              end,
              buffer1,
              buffer2,
              buffer3,
              latitude,
              longitude,
              accuracyRadius,
              counter,
              postalCode,
            }
          }
        }
      })
      .on('pause', () => {
        writeStreamDat1.once('drain', () => readStream.resume())
        if (!settings.smallMemory && writeStreamDat2 && writeStreamDat3) {
          writeStreamDat2.once('drain', () => readStream.resume())
          writeStreamDat3.once('drain', () => readStream.resume())
        }
      })
      .on('end', () => {
        if (settings.smallMemory) {
          writeStreamSmallMemory = createSmallMemoryFile(writeStreamSmallMemory!, version, lineCount++, previousData!.buffer2, previousData!.buffer3, settings)
          writeStreamSmallMemory?.end(check)
          ++checkCount
        }
        else {
          writeStreamDat2?.end(check)
          writeStreamDat3?.end(check)
        }
        writeStreamDat1?.end(check)
      })
  })
}